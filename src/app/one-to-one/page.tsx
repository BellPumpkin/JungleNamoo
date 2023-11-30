"use client";
import {
  Connection,
  OpenVidu,
  Publisher,
  Session,
  StreamManager,
} from "openvidu-browser";
import { Grid, Stack } from "@mui/material";
import React, { useEffect, useState } from "react";
import Typography from "@mui/material/Typography";
import {
  closeOpenViduConnection,
  createOpenViduConnection,
} from "@/utils/openvidu";
import { Role } from "@/types";
import useJwtToken, { JwtToken } from "@/hooks/useJwtToken";
import DeviceControlButton from "@/components/meeting/DeviceControlButton";
import { fetchFanToFanMeeting } from "@/hooks/useFanMeetings";
import { useRouter, useSearchParams } from "next/navigation";
import LinearTimerBar from "@/components/ShowTimer";
import MyStreamView from "@/components/meeting/MyStreamView";
import PartnerStreamView from "@/components/meeting/PartnerStreamView";
import ChatAndMemo from "@/components/ChatAndMemo";
import EndAlertBar from "@/components/Timer";
import { backend_api, SPRING_URL } from "@/utils/api";
import MotionDetector from "@/components/MotionDetector";
import TeachableMachinePose from "@/app/motion/page";
import html2canvas from "html2canvas";

const OneToOnePage = () => {
  const router = useRouter();

  /* Query Param으로 전달된 팬미팅 아이디 */
  const searchParams = useSearchParams();
  const fanMeetingId = searchParams?.get("fanMeetingId");
  const sessionId = searchParams?.get("sessionId");

  /* OpenVidu */
  const [OV, setOV] = useState<OpenVidu | undefined>();

  /* OpenVidu Session Info*/
  const [session, setSession] = useState<Session | undefined>();

  /* OpenVidu Stream */
  const [myStream, setMyStream] = useState<Publisher | undefined>();
  const [partnerStream, setPartnerStream] = useState<
    StreamManager | undefined
  >();

  /* TODO: 닉네임 */
  const [myNickName, setMyNickName] = useState<string | undefined>(undefined);
  const [partnerNickName, setPartnerNickName] = useState<string | undefined>(
    undefined,
  );

  /* OpenVidu Connection */
  const [myConnection, setMyConnection] = useState<Connection | undefined>();

  /* Layout */
  const [fullScreen, setFullScreen] = useState<boolean>(false);

  /* React Query FanToFanMeeting 조회 */
  const [chatRoomId, setChatRoomId] = useState<string | undefined>();

  /* 팬미팅 종료 임박 Alert */
  const [alertBarOpen, setAlertBarOpen] = useState<boolean>(false);

  /* 녹화를 위한 recordingid */
  const [forceRecordingId, setForceRecordingId] = useState("");

  /* 다음 아이돌의 대기실로 넘어가기 위해 필요한 state */
  const [popupOpen, setPopupOpen] = useState<boolean>(false);
  const [nextRoomId, setNextRoomId] = useState<string>("");

  useEffect(() => {
    async function findFanToFanMeeting() {
      const fanToFanMeeting = await fetchFanToFanMeeting(fanMeetingId);
      setChatRoomId(fanToFanMeeting?.chatRoomId);
    }

    findFanToFanMeeting();
  }, []);

  /* Role */
  const token: Promise<JwtToken | null> = useJwtToken();
  const [role, setRole] = useState<Role | undefined>();
  const [userName, setUserName] = useState<string>("");
  useEffect(() => {
    token.then((res) => {
      setRole(res?.auth);
      setUserName(res?.sub ?? "");
    });
  }, [token]);

  useEffect(() => {
    async function init() {
      if (role === Role.FAN) {
        await fetchSSE();
      }
      await joinSession();
    }

    if (role && userName !== "") {
      init();
    }
  }, [role, userName]);

  const startRecording = () => {
    backend_api()
      .post(
        SPRING_URL + "/recording-java/api/recording/start",

        {
          session: sessionId,
          fanMeetingId: fanMeetingId,
          fan: userName,
          idol: partnerNickName,

          // name: "room-" + mySessionId + "_memberId-" + myUserName,
          hasAudio: true,
          hasVideo: true,
          outputMode: "COMPOSED",
        },
      )
      .then((response) => {
        console.log(response.data);
        setForceRecordingId(response.data.id);
      })
      .catch((error) => {
        console.error("Start recording WRONG:", error);
      });
  };

  const joinSession = async () => {
    try {
      // OpenVidu 객체 생성
      const ov = new OpenVidu();
      setOV(ov);

      const mySession = ov.initSession();

      mySession.on("streamCreated", (event) => {
        const subscriber = mySession.subscribe(event.stream, undefined);
        setPartnerStream(subscriber);
      });

      mySession.on("streamDestroyed", (event) => {
        setPartnerStream(undefined);
      });

      await createOpenViduSession(sessionId);

      const connection = await createOpenViduConnection(sessionId);
      if (connection) {
        setMyConnection(connection);
      }
      const { token } = connection;
      await mySession
        .connect(token, {
          clientData: JSON.stringify({
            role: role,
            fanMeetingId: fanMeetingId,
            userName: userName,
            type: "idolRoom",
          }),
        })
        .then(() => {
          if (role === Role.FAN) {
            startRecording();
          }
        });

      await ov.getUserMedia({
        audioSource: undefined,
        videoSource: undefined,
      });

      const devices = await ov.getDevices();
      const videoDevices = devices.filter(
        (device) => device.kind === "videoinput",
      );

      const newPublisher = await ov.initPublisherAsync(undefined, {
        audioSource: undefined,
        videoSource: videoDevices[0].deviceId,
        publishAudio: true,
        publishVideo: true,
        resolution: "640x480",
        frameRate: 30,
        insertMode: "APPEND",
      });
      mySession.publish(newPublisher);
      setSession(mySession);
      setMyStream(newPublisher);
    } catch (error) {
      console.error("Error in enterFanmeeting:", error);
      return null;
    }
  };

  const fetchSSE = async () => {
    const eventSource = new EventSource(
      `https://api.doldolmeet.shop/fanMeetings/${fanMeetingId}/sse/${userName}`,
    );

    eventSource.addEventListener("moveToWaitRoom", (e: MessageEvent) => {
      console.log("🥹 moveToWaitRoom: ", JSON.parse(e.data));
      setNextRoomId(JSON.parse(e.data).nextRoomId);
      joinNextRoom(JSON.parse(e.data).nextRoomId);
    });

    eventSource.addEventListener("endNotice", (e: MessageEvent) => {
      console.log("🥹 통화가 곧 종료 됩니다.", JSON.parse(e.data));
      setAlertBarOpen(true);
    });

    eventSource.onopen = () => {
      console.log("📣 SSE 연결되었습니다.");
    };

    eventSource.onerror = (e) => {
      // 종료 또는 에러 발생 시 할 일
      console.log("error");
      console.log(e);
      eventSource.close();

      if (e.error) {
        // 에러 발생 시 할 일
      }

      if (e.target.readyState === EventSource.CLOSED) {
        // 종료 시 할 일
      }
    };

    return true;
  };

  // 세션을 나가면서 정리
  const leaveSession = async () => {
    if (sessionId && myConnection?.connectionId) {
      await closeOpenViduConnection(sessionId, myConnection?.connectionId);
    }

    // state 초기화
    setMyStream(undefined);
    setPartnerStream(undefined);
    setMyConnection(undefined);
  };

  useEffect(() => {
    const handleBeforeUnload = (event) => {
      leaveSession();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [leaveSession]);

  const joinNextRoom = async (sessionId: string) => {
    await leaveWaitingRoom();
    if (sessionId === "END") {
      router.push(`/end-fanmeeting/${userName}/${fanMeetingId}}`);
    } else {
      router.push(
        `/one-idol-waitingroom?fanMeetingId=${fanMeetingId}&sessionId=${sessionId}`,
      );
    }
  };

  const leaveWaitingRoom = async () => {
    if (sessionId && myConnection?.connectionId) {
      await closeOpenViduConnection(sessionId, myConnection.connectionId);
    }
  };

  const onCapture = () => {
    const targetElement = document.getElementById("video-container");
    if (targetElement) {
      html2canvas(targetElement)
        .then((canvas) => {
          // onSavaAs(canvas.toDataURL("image/png"), "image-download.png");
          const imageDataUrl = canvas.toDataURL("image/png");
          uploadImage(imageDataUrl);
        })
        .catch((error) => {
          console.error("html2canvas error:", error);
        });
    } else {
      console.error("Target element not found");
    }
  };

  const uploadImage = (imageDataUrl) => {
    const blobImage = dataURLtoBlob(imageDataUrl);
    // Blob을 파일로 변환
    const imageFile = new File([blobImage], "image.png", { type: "image/png" });

    const formData = new FormData();
    formData.append("file", imageFile);

    if (fanMeetingId) {
      backend_api()
        .post(`/captures/upload/${fanMeetingId}`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        })
        .then((response) => {
          console.log("Image uploaded successfully:", response.data);
        })
        .catch((error) => {
          console.error("Image upload failed:", error);
        });
    }
  };

  function dataURLtoBlob(dataURL) {
    let arr = dataURL.split(","),
      mime = arr[0].match(/:(.*?);/)[1],
      bstr = atob(arr[1]),
      n = bstr.length,
      u8arr = new Uint8Array(n);

    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }

    return new Blob([u8arr], { type: mime });
  }

  return (
    <Grid container spacing={2}>
      <Grid
        item
        xs={fullScreen ? 12 : 8.5}
        sx={{
          backgroundColor: "rgba(238,238,238,0.7)",
          borderRadius: 5,
          padding: 2,
        }}
      >
        <Grid
          container
          direction="row"
          justifyContent="center"
          alignItems={"flex-start"}
        >
          <Grid item xs={12}>
            <Stack
              direction={"row"}
              justifyContent="space-between"
              alignItems="center"
              sx={{
                backgroundColor: "transparent",
                px: 2,
                mb: 2,
                height: 60,
              }}
            >
              <Typography variant={"h4"}>
                {"💜 Aespa Drama 발매 기념 팬미팅"}
              </Typography>
              <LinearTimerBar />
              <DeviceControlButton
                publisher={myStream}
                fullScreen={fullScreen}
                toggleFullScreen={() => setFullScreen(!fullScreen)}
              />
            </Stack>
          </Grid>
          <Grid
            item
            id="video-container"
            xs={12}
            container
            justifyContent="space-between"
          >
            <Grid item xs={6}>
              {role === Role.IDOL ? (
                <MyStreamView
                  name={`😎 ${myNickName ?? "아이돌"}`}
                  stream={myStream}
                />
              ) : (
                <PartnerStreamView
                  name={`😎 ${partnerNickName ?? "아이돌"}`}
                  stream={partnerStream}
                  partnerRole={Role.IDOL}
                />
              )}
            </Grid>
            <Grid item xs={6}>
              {role === Role.FAN ? (
                <MyStreamView
                  name={`😍 ${myNickName ?? "팬"}`}
                  stream={myStream}
                />
              ) : (
                <PartnerStreamView
                  name={`😍 ${partnerNickName ?? "팬"}`}
                  stream={partnerStream}
                  partnerRole={Role.FAN}
                />
              )}
            </Grid>
          </Grid>
        </Grid>
      </Grid>

      {!fullScreen && (
        <Grid
          item
          xs={3.5}
          sx={{
            backgroundColor: "rgba(238,238,238,0.7)",
            borderRadius: 5,
            padding: 2,
          }}
        >
          <ChatAndMemo chatRoomId={chatRoomId} height={"75vh"} />
        </Grid>
      )}
      <EndAlertBar
        open={alertBarOpen}
        handleClose={() => setAlertBarOpen(false)}
      />
      <MotionDetector handleDetected={onCapture} />
    </Grid>
  );
};

export default OneToOnePage;
