"use client";
import { useEffect, useRef } from "react";
import { StreamManager } from "openvidu-browser";

const OpenViduVideoComponent = ({
  streamManager,
}: {
  streamManager: StreamManager;
}) => {
  const videoRef = useRef(null);

  useEffect(() => {
    if (streamManager && videoRef.current) {
      streamManager.addVideoElement(videoRef.current);
    }
  }, [streamManager]);

  return (
    <video
      autoPlay={true}
      ref={videoRef}
      style={{ borderRadius: 20, width: "98%", margin: 10 }}
    />
  );
};

export default OpenViduVideoComponent;
