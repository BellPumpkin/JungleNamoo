"use client";
import React, { useRef, useEffect, useState } from "react";
import "./styles/global.css";

const ScratchCard = ({ imageSrc, brushSize, revealPercent }) => {
  const scratchCanvasRef = useRef(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [scratchPercentage, setScratchPercentage] = useState(0);

  useEffect(() => {
    const scratchCanvas = scratchCanvasRef.current;
    const scratchContext = scratchCanvas.getContext("2d");

    // 가리개 레이어 초기화
    scratchContext.fillStyle = "#AAAAAA";
    scratchContext.fillRect(0, 0, scratchCanvas.width, scratchCanvas.height);

    // 스크래치 효과 함수
    const scratch = (e) => {
      const rect = scratchCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      scratchContext.globalCompositeOperation = "destination-out";
      scratchContext.beginPath();
      scratchContext.arc(x, y, brushSize, 0, Math.PI * 2);
      scratchContext.fill();

      updateScratchPercentage();
    };

    // 스크래치된 영역의 비율 계산
    const updateScratchPercentage = () => {
      const imageData = scratchContext.getImageData(
        0,
        0,
        scratchCanvas.width,
        scratchCanvas.height,
      );
      const pixels = imageData.data;
      let transparentPixels = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] === 0) {
          transparentPixels++;
        }
      }
      const percentage = (transparentPixels / (pixels.length / 4)) * 100;
      setScratchPercentage(percentage);
    };

    // 이벤트 리스너 추가
    scratchCanvas.addEventListener("mousemove", scratch);

    return () => {
      // 이벤트 리스너 제거
      scratchCanvas.removeEventListener("mousemove", scratch);
    };
  }, [brushSize, revealPercent]);

  // 이미지 회전 및 가리개 제거 함수
  const revealImage = () => {
    setIsRevealed(true);
    // 가리개 캔버스 제거
    scratchCanvasRef.current.style.display = "none";
  };

  return (
    <div style={{ position: "relative" }}>
      {scratchPercentage > revealPercent && !isRevealed && (
        <button onClick={revealImage}>이미지 확인하기</button>
      )}
      <img
        src={imageSrc}
        alt="Scratch Image"
        style={{
          position: "absolute",
          width: "480px",
          height: "360px",
          animation: isRevealed ? "spin 3s linear" : "none",
        }}
      />
      <canvas
        ref={scratchCanvasRef}
        width={480}
        height={360}
        style={{ position: "absolute" }}
      />
    </div>
  );
};

export default ScratchCard;