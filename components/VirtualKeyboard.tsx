import React, { useRef, useEffect, useMemo } from 'react';
import { Key } from '../types';

interface VirtualKeyboardProps {
  onKeyPress: (key: string) => void;
  hoveredKeyId: string | null;
  activeKeyId: string | null;
  setKeyRects: (rects: Record<string, DOMRect>) => void;
}

const ROWS: Key[][] = [
  [
    { id: '1', label: '1', value: '1' }, { id: '2', label: '2', value: '2' }, { id: '3', label: '3', value: '3' },
    { id: '4', label: '4', value: '4' }, { id: '5', label: '5', value: '5' }, { id: '6', label: '6', value: '6' },
    { id: '7', label: '7', value: '7' }, { id: '8', label: '8', value: '8' }, { id: '9', label: '9', value: '9' },
    { id: '0', label: '0', value: '0' }, { id: 'backspace', label: '⌫', value: 'BACKSPACE', type: 'action', width: 1.5 },
  ],
  [
    { id: 'q', label: 'Q', value: 'q' }, { id: 'w', label: 'W', value: 'w' }, { id: 'e', label: 'E', value: 'e' },
    { id: 'r', label: 'R', value: 'r' }, { id: 't', label: 'T', value: 't' }, { id: 'y', label: 'Y', value: 'y' },
    { id: 'u', label: 'U', value: 'u' }, { id: 'i', label: 'I', value: 'i' }, { id: 'o', label: 'O', value: 'o' },
    { id: 'p', label: 'P', value: 'p' },
  ],
  [
    { id: 'a', label: 'A', value: 'a' }, { id: 's', label: 'S', value: 's' }, { id: 'd', label: 'D', value: 'd' },
    { id: 'f', label: 'F', value: 'f' }, { id: 'g', label: 'G', value: 'g' }, { id: 'h', label: 'H', value: 'h' },
    { id: 'j', label: 'J', value: 'j' }, { id: 'k', label: 'K', value: 'k' }, { id: 'l', label: 'L', value: 'l' },
    { id: 'enter', label: 'ENTER', value: 'ENTER', type: 'action', width: 1.5 },
  ],
  [
    { id: 'shift', label: '⇧', value: 'SHIFT', type: 'action' },
    { id: 'z', label: 'Z', value: 'z' }, { id: 'x', label: 'X', value: 'x' }, { id: 'c', label: 'C', value: 'c' },
    { id: 'v', label: 'V', value: 'v' }, { id: 'b', label: 'B', value: 'b' }, { id: 'n', label: 'N', value: 'n' },
    { id: 'm', label: 'M', value: 'm' },
    { id: ',', label: ',', value: ',' }, { id: '.', label: '.', value: '.' },
    { id: 'clear', label: 'CLR', value: 'CLEAR', type: 'action' },
  ],
  [
    { id: 'space', label: 'SPACE', value: ' ', width: 6 },
    { id: 'ai-fix', label: '✨ AI FIX', value: 'AI_FIX', type: 'action', width: 2.5 },
  ]
];

const VirtualKeyboard: React.FC<VirtualKeyboardProps> = ({ hoveredKeyId, activeKeyId, setKeyRects }) => {
  const keyboardRef = useRef<HTMLDivElement>(null);

  // Update rects when window resizes or component mounts
  useEffect(() => {
    const updateRects = () => {
      if (!keyboardRef.current) return;
      const keys = keyboardRef.current.querySelectorAll('[data-key-id]');
      const newRects: Record<string, DOMRect> = {};
      
      keys.forEach((key) => {
        const id = key.getAttribute('data-key-id');
        if (id) {
          newRects[id] = key.getBoundingClientRect();
        }
      });
      setKeyRects(newRects);
    };

    updateRects();
    window.addEventListener('resize', updateRects);
    
    // Initial delay to ensure rendering is complete
    const timeout = setTimeout(updateRects, 500);

    return () => {
      window.removeEventListener('resize', updateRects);
      clearTimeout(timeout);
    };
  }, [setKeyRects]);

  return (
    <div 
      ref={keyboardRef}
      className="w-full max-w-5xl mx-auto p-4 select-none pointer-events-none" 
    >
      <div className="flex flex-col gap-3">
        {ROWS.map((row, rowIndex) => (
          <div key={rowIndex} className="flex justify-center gap-2">
            {row.map((key) => {
              const isHovered = hoveredKeyId === key.id;
              const isActive = activeKeyId === key.id;
              
              // Futuristic Holographic Styling
              let bgClass = "bg-slate-900/40 border-cyan-900/40 text-cyan-500/80 shadow-[0_0_10px_rgba(8,145,178,0.05)]"; // Default
              
              if (isActive) {
                // Active / Pressed State (High Energy)
                bgClass = "bg-cyan-400 border-cyan-300 text-black shadow-[0_0_25px_rgba(34,211,238,0.8)] scale-95 z-10 font-bold";
              } else if (isHovered) {
                // Hover State (Pre-activation)
                bgClass = "bg-cyan-950/60 border-cyan-400 text-cyan-200 shadow-[0_0_15px_rgba(34,211,238,0.4)] scale-110 z-10";
              }

              return (
                <div
                  key={key.id}
                  data-key-id={key.id}
                  className={`
                    relative flex items-center justify-center
                    rounded border transition-all duration-150 ease-out
                    text-lg font-mono tracking-wider
                    backdrop-blur-sm
                    ${bgClass}
                  `}
                  style={{
                    height: '55px',
                    width: key.width ? `${key.width * 55}px` : '55px',
                    flexGrow: key.width ? 0 : 1,
                    maxWidth: key.width ? 'none' : '65px',
                  }}
                >
                  {key.label}
                  {/* Decorative corner accents for tech look */}
                  {!isActive && (
                    <>
                        <div className="absolute top-0 left-0 w-1 h-1 border-t border-l border-cyan-500/30"></div>
                        <div className="absolute top-0 right-0 w-1 h-1 border-t border-r border-cyan-500/30"></div>
                        <div className="absolute bottom-0 left-0 w-1 h-1 border-b border-l border-cyan-500/30"></div>
                        <div className="absolute bottom-0 right-0 w-1 h-1 border-b border-r border-cyan-500/30"></div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export default VirtualKeyboard;