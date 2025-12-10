import React, { useEffect, useRef, useState, useCallback } from 'react';
import VirtualKeyboard from './components/VirtualKeyboard';
import { correctText, autocompleteText } from './services/geminiService';
import { AppState } from './types';
import { Loader2, Camera as CameraIcon, BrainCircuit, Volume2, VolumeX, Hand, Settings, X, SlidersHorizontal, Cpu, Radio, ChevronRight, CheckCircle2, MousePointer2, ScanFace } from 'lucide-react';

// Declare globals loaded via script tags in index.html
declare var Hands: any;
declare var drawConnectors: any;
declare var drawLandmarks: any;

// Initial Defaults
const DEFAULT_PINCH_THRESHOLD = 0.04; 
const DEFAULT_CURSOR_SMOOTHING = 0.4;
const DEFAULT_EXTENSION_THRESHOLD = 0.0; // Y-distance offset to consider finger extended

// Define HAND_CONNECTIONS locally as the module export can be unreliable in some CDN builds
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]
] as [number, number][];

function App() {
  const [text, setText] = useState('');
  const [appState, setAppState] = useState<AppState>(AppState.LOADING);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [isPinching, setIsPinching] = useState(false);
  const [gestureMode, setGestureMode] = useState<'move' | 'click' | 'wait'>('wait');
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [keyRects, setKeyRects] = useState<Record<string, DOMRect>>({});
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [cameraPermission, setCameraPermission] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  
  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({
      cursorSmoothing: DEFAULT_CURSOR_SMOOTHING,
      pinchThreshold: DEFAULT_PINCH_THRESHOLD,
      extensionThreshold: DEFAULT_EXTENSION_THRESHOLD
  });

  // Tutorial State: 0=Off, 1=Welcome, 2=Move, 3=Click, 4=AI, 5=Done
  const [tutorialStep, setTutorialStep] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<{ x: number; y: number } | null>(null); // For smoothing
  const audioContextRef = useRef<AudioContext | null>(null);

  // Check for first-time user
  useEffect(() => {
    const hasSeenTutorial = localStorage.getItem('airtype_tutorial_seen');
    if (!hasSeenTutorial) {
        // Small delay to let app load before showing tutorial
        setTimeout(() => setTutorialStep(1), 1000);
    }
  }, []);

  const completeTutorial = () => {
      setTutorialStep(0);
      localStorage.setItem('airtype_tutorial_seen', 'true');
      playSound('success');
  };

  const skipTutorial = () => {
      setTutorialStep(0);
      localStorage.setItem('airtype_tutorial_seen', 'true');
  };

  // Audio utility
  const playSound = useCallback((type: 'click' | 'success' | 'step') => {
    if (isMuted) return;

    if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioContextRef.current;
    
    // Attempt to resume if suspended (requires user interaction previously)
    if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
    }
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    const now = ctx.currentTime;
    
    if (type === 'click') {
        osc.type = 'triangle'; // Techy sound
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
        
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        
        osc.start(now);
        osc.stop(now + 0.1);
    } else if (type === 'success') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(500, now);
        osc.frequency.linearRampToValueAtTime(1000, now + 0.1);
        osc.frequency.linearRampToValueAtTime(1500, now + 0.3);
        
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.5);
        
        osc.start(now);
        osc.stop(now + 0.5);
    } else if (type === 'step') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.linearRampToValueAtTime(800, now + 0.1);
        gain.gain.setValueAtTime(0.02, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
    }
  }, [isMuted]);

  // Interactive Tutorial Logic: Auto-advance
  useEffect(() => {
    if (tutorialStep === 2 && gestureMode === 'move') {
        // User successfully moved hand
        const timer = setTimeout(() => {
            playSound('step');
            setTutorialStep(3);
        }, 1500); // Wait 1.5s to confirm they got it
        return () => clearTimeout(timer);
    }
    
    if (tutorialStep === 3 && isPinching) {
        // User successfully pinched
        const timer = setTimeout(() => {
            playSound('step');
            setTutorialStep(4);
        }, 500);
        return () => clearTimeout(timer);
    }
  }, [tutorialStep, gestureMode, isPinching, playSound]);


  // Handlers for keyboard actions
  const handleKeyPress = useCallback(async (keyId: string) => {
    playSound('click');
    
    switch (keyId) {
      case 'backspace':
        setText(prev => prev.slice(0, -1));
        break;
      case 'space':
        setText(prev => prev + ' ');
        break;
      case 'enter':
        setText(prev => prev + '\n');
        break;
      case 'clear':
        setText('');
        break;
      case 'ai-fix':
        if (text.length > 0) {
          setIsProcessingAI(true);
          const fixed = await correctText(text);
          setText(fixed);
          setIsProcessingAI(false);
          playSound('success');
        }
        break;
      case 'shift':
        break;
      default:
        // Regular characters
        const keyElement = document.querySelector(`[data-key-id="${keyId}"]`);
        if (keyElement) {
           const label = keyElement.textContent;
           if (label && label.length === 1) {
             setText(prev => prev + label.toLowerCase());
           }
        }
        break;
    }
  }, [text, playSound]);

  // Main Hand Tracking Loop
  const onResults = useCallback((results: any) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Reset canvas
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw video frame to canvas
    // Dim the video to make UI pop
    ctx.globalAlpha = 0.3;
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1.0;

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      // Process only the first hand detected for simplicity
      const landmarks = results.multiHandLandmarks[0];

      // Draw hand skeleton - Futuristic Style
      drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: 'rgba(34, 211, 238, 0.4)', lineWidth: 1 });
      drawLandmarks(ctx, landmarks, { color: '#22d3ee', lineWidth: 1, radius: 2 });

      // Landmark indices: 8 = Index Tip, 4 = Thumb Tip
      const indexTip = landmarks[8];
      const thumbTip = landmarks[4];

      // Convert normalized coordinates to screen pixel coordinates
      // Video is mirrored horizontally usually, so x = 1 - x
      const x = (1 - indexTip.x) * window.innerWidth;
      const y = indexTip.y * window.innerHeight;

      // --- Gesture Detection ---

      // Helper: Check if finger is extended (Tip is above PIP joint in Y-axis)
      const isExtended = (tipIdx: number, pipIdx: number) => 
            landmarks[tipIdx].y < (landmarks[pipIdx].y - settings.extensionThreshold);
      
      const indexUp = isExtended(8, 6);
      const middleUp = isExtended(12, 10);
      const ringUp = isExtended(16, 14);
      const pinkyUp = isExtended(20, 18);
      
      // Count extended fingers
      let extendedFingers = 0;
      if (indexUp) extendedFingers++;
      if (middleUp) extendedFingers++;
      if (ringUp) extendedFingers++;
      if (pinkyUp) extendedFingers++;

      // Check Pinch (Thumb + Index distance)
      const dx = indexTip.x - thumbTip.x;
      const dy = indexTip.y - thumbTip.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const isPinchGesture = distance < settings.pinchThreshold;

      // Check "2 Fingers" Gesture (Peace Sign)
      const isTwoFingerGesture = indexUp && middleUp && !ringUp && !pinkyUp;

      // Check "5 Fingers" / Open Hand
      const isOpenHand = extendedFingers >= 3;

      // --- Mode Logic ---
      
      let shouldUpdateCursor = false;
      let shouldTriggerClick = false;

      // Cursor moves ONLY when hand is open (Open Hand).
      if (isOpenHand && !isPinchGesture) {
          shouldUpdateCursor = true;
          setGestureMode('move');
      } else if (isPinchGesture || isTwoFingerGesture) {
          // If Pinch OR 2-Finger gesture, we click.
          // We STOP updating cursor to prevent jitter (Cursor Parking).
          shouldUpdateCursor = false;
          shouldTriggerClick = true;
          setGestureMode('click');
      } else {
          setGestureMode('wait');
      }

      // --- Cursor Update ---
      if (shouldUpdateCursor) {
          if (!cursorRef.current) {
            cursorRef.current = { x, y };
          } else {
            // Apply configured smoothing
            const smoothFactor = settings.cursorSmoothing;
            cursorRef.current.x = cursorRef.current.x + (x - cursorRef.current.x) * smoothFactor;
            cursorRef.current.y = cursorRef.current.y + (y - cursorRef.current.y) * smoothFactor;
          }
      }
      
      const smoothedCursor = cursorRef.current ? { ...cursorRef.current } : { x, y };
      setCursor(smoothedCursor);
      setIsPinching(shouldTriggerClick);

      // --- Hit Testing ---
      if (smoothedCursor) {
          let hitKey: string | null = null;
          for (const keyId of Object.keys(keyRects)) {
            const rect = keyRects[keyId];
            if (
              smoothedCursor.x >= rect.left &&
              smoothedCursor.x <= rect.right &&
              smoothedCursor.y >= rect.top &&
              smoothedCursor.y <= rect.bottom
            ) {
              hitKey = keyId;
              break;
            }
          }
          setHoveredKey(hitKey);
      }

    } else {
      setCursor(null);
      setHoveredKey(null);
      setIsPinching(false);
      setGestureMode('wait');
    }
    
    ctx.restore();
  }, [keyRects, settings]);

  // Keep latest onResults in a ref to avoid re-initializing Hands/Camera on prop changes
  const onResultsRef = useRef(onResults);
  useEffect(() => {
    onResultsRef.current = onResults;
  }, [onResults]);

  // Handle click triggering separately to avoid dependency loops in onResults
  const prevPinchRef = useRef(false);
  useEffect(() => {
    if (isPinching && !prevPinchRef.current && hoveredKey) {
       // Gesture started
       setActiveKey(hoveredKey);
       handleKeyPress(hoveredKey);
    } else if (!isPinching && prevPinchRef.current) {
       // Gesture ended
       setActiveKey(null);
    }
    prevPinchRef.current = isPinching;
  }, [isPinching, hoveredKey, handleKeyPress]);


  useEffect(() => {
    let hands: any = null;
    let animationFrameId: number;
    let stream: MediaStream | null = null;

    const setupHands = async () => {
        // Hands is now a global class from the script tag
        hands = new Hands({
          locateFile: (file: string) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
          },
        });

        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        hands.onResults((results: any) => {
            if (onResultsRef.current) {
                onResultsRef.current(results);
            }
        });

        // Initialize Camera
        if (videoRef.current) {
            try {
                const constraints = {
                    video: {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        facingMode: 'user'
                    }
                };

                stream = await navigator.mediaDevices.getUserMedia(constraints);
                videoRef.current.srcObject = stream;
                
                await new Promise<void>((resolve) => {
                    if (!videoRef.current) return;
                    videoRef.current.onloadedmetadata = () => {
                        videoRef.current!.play();
                        resolve();
                    }
                });

                setAppState(AppState.READY);
                setCameraPermission(true);

                const processFrame = async () => {
                    if (videoRef.current && hands) {
                        if (videoRef.current.readyState >= 2) {
                             await hands.send({ image: videoRef.current });
                        }
                    }
                    animationFrameId = requestAnimationFrame(processFrame);
                };
                processFrame();

            } catch (err) {
                console.error("Camera/Hands init failed", err);
                setAppState(AppState.ERROR);
            }
        }
    };

    setupHands();
    
    // Cleanup
    return () => {
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        if (hands) hands.close();
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
    };
  }, []); // Run once on mount

  // Adjust canvas size to window
  useEffect(() => {
      const handleResize = () => {
          if(canvasRef.current && videoRef.current) {
              canvasRef.current.width = window.innerWidth;
              canvasRef.current.height = window.innerHeight;
          }
      }
      window.addEventListener('resize', handleResize);
      handleResize();
      return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="relative w-screen h-screen bg-slate-950 overflow-hidden flex flex-col font-mono text-cyan-50">
      
      {/* Background Elements */}
      <div className="absolute inset-0 z-0 cyber-grid opacity-30"></div>
      <div className="absolute inset-0 z-50 scanlines pointer-events-none"></div>

      {/* Video & Canvas Layer */}
      <div className="absolute inset-0 z-0">
        <video
          ref={videoRef}
          className="absolute w-full h-full object-cover transform -scale-x-100 opacity-20"
          playsInline
          muted
        />
        <canvas
          ref={canvasRef}
          className="absolute w-full h-full object-cover transform -scale-x-100 opacity-80 pointer-events-none"
        />
      </div>

      {/* Main Content UI */}
      <div className="relative z-10 flex flex-col h-full pointer-events-none">
        
        {/* Top Status Bar */}
        <div className="w-full h-12 bg-slate-900/80 backdrop-blur-md border-b border-cyan-900/50 flex justify-between items-center px-6 pointer-events-auto z-50">
           <div className="flex items-center gap-2 text-cyan-400">
             <Cpu size={18} />
             <span className="text-sm font-bold tracking-widest">SYSTEM_READY</span>
           </div>
           
           <div className="flex items-center gap-6">
                <div className={`flex items-center gap-2 px-3 py-1 rounded border ${
                        gestureMode === 'move' ? 'border-green-500/50 bg-green-500/10 text-green-400' :
                        gestureMode === 'click' ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400' :
                        'border-slate-700 bg-slate-800/50 text-slate-500'
                    }`}>
                    <Radio size={14} className={gestureMode !== 'wait' ? "animate-pulse" : ""} />
                    <span className="text-xs font-bold tracking-wider">
                        {gestureMode === 'move' && "TRACKING_HAND"}
                        {gestureMode === 'click' && "GESTURE_LOCKED"}
                        {gestureMode === 'wait' && "NO_SIGNAL"}
                    </span>
                </div>

                <div className="flex items-center gap-4">
                     <button 
                        onClick={() => setIsMuted(!isMuted)} 
                        className="text-cyan-600 hover:text-cyan-300 transition-colors"
                    >
                        {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                    </button>
                     <button 
                        onClick={() => setShowSettings(true)} 
                        className="text-cyan-600 hover:text-cyan-300 transition-colors"
                    >
                        <Settings size={18} />
                    </button>
                </div>
           </div>
        </div>

        {/* HUD Display Area */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 relative">
            {/* HUD Bracket Decorations */}
            <div className="absolute top-10 left-10 w-32 h-32 border-l-2 border-t-2 border-cyan-500/30 rounded-tl-3xl pointer-events-none"></div>
            <div className="absolute top-10 right-10 w-32 h-32 border-r-2 border-t-2 border-cyan-500/30 rounded-tr-3xl pointer-events-none"></div>
            <div className="absolute bottom-32 left-10 w-32 h-32 border-l-2 border-b-2 border-cyan-500/30 rounded-bl-3xl pointer-events-none"></div>
            <div className="absolute bottom-32 right-10 w-32 h-32 border-r-2 border-b-2 border-cyan-500/30 rounded-br-3xl pointer-events-none"></div>

            <div className="glass-panel relative rounded-lg p-8 w-full max-w-4xl border border-cyan-500/30 pointer-events-auto">
                <div className="absolute -top-3 -left-1 text-xs text-cyan-500/50 bg-slate-900 px-2">OUTPUT_STREAM</div>
                
                <textarea
                    value={text}
                    readOnly
                    placeholder="INITIALIZE INPUT..."
                    className="w-full h-40 bg-transparent text-5xl text-cyan-50 outline-none resize-none placeholder-cyan-900/50 leading-tight font-light tracking-wide"
                />
                
                <div className="mt-6 flex justify-between items-center border-t border-cyan-900/30 pt-4">
                    <div className="text-xs text-cyan-600 flex gap-4 uppercase tracking-widest">
                        <span>[ OPEN HAND: MOVE ]</span>
                        <span>[ PINCH: EXECUTE ]</span>
                    </div>
                    <button 
                         className="flex items-center gap-2 px-6 py-2 bg-cyan-950/50 text-cyan-400 border border-cyan-500/50 text-sm font-bold tracking-widest hover:bg-cyan-500/20 hover:border-cyan-400 hover:shadow-[0_0_15px_rgba(34,211,238,0.3)] transition-all duration-300 group"
                         onClick={async () => {
                             setIsProcessingAI(true);
                             const completed = await autocompleteText(text);
                             if(completed) {
                                setText(prev => prev + completed);
                                playSound('success');
                             }
                             setIsProcessingAI(false);
                         }}
                    >
                        {isProcessingAI ? <Loader2 className="animate-spin" size={16}/> : <BrainCircuit size={16} className="group-hover:text-white"/>}
                        AI_AUTOCOMPLETE
                    </button>
                </div>
            </div>
        </div>

        {/* Keyboard Area */}
        <div className="pb-12 relative">
             <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full mb-2 text-cyan-800 text-[10px] tracking-[0.5em]">VIRTUAL_KEYBOARD_INTERFACE_V2.0</div>
             <VirtualKeyboard 
                onKeyPress={(key) => {}} // Handled via effect for gesture mapping
                hoveredKeyId={hoveredKey}
                activeKeyId={activeKey}
                setKeyRects={(rects) => setKeyRects(prev => ({...prev, ...rects}))}
             />
        </div>
      </div>

      {/* Futuristic Cursor */}
      {cursor && (
        <div 
            className="fixed pointer-events-none z-[100] transition-transform duration-100 ease-linear"
            style={{ 
                left: cursor.x, 
                top: cursor.y,
                transform: `translate(-50%, -50%) scale(${isPinching ? 0.8 : 1})`
            }}
        >
            {/* Outer Ring */}
            <div className={`w-12 h-12 border border-cyan-400 rounded-full flex items-center justify-center transition-all duration-200 ${isPinching ? 'border-2 bg-cyan-500/20 shadow-[0_0_20px_cyan]' : 'opacity-80'}`}>
                {/* Inner Dots */}
                <div className="w-1 h-1 bg-cyan-300 absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2"></div>
                <div className="w-1 h-1 bg-cyan-300 absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2"></div>
                <div className="w-1 h-1 bg-cyan-300 absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2"></div>
                <div className="w-1 h-1 bg-cyan-300 absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2"></div>
                
                {/* Center Point */}
                <div className={`w-1 h-1 bg-white rounded-full ${isPinching ? 'w-2 h-2' : ''}`}></div>
            </div>
            {/* Trailing Line (Simulated) */}
            <div className="absolute top-1/2 left-1/2 w-20 h-px bg-gradient-to-l from-cyan-500/0 to-cyan-500/0 transform rotate-45 -z-10"></div>
        </div>
      )}

      {/* Tutorial Overlay */}
      {tutorialStep > 0 && (
          <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center pointer-events-auto">
              <div className="glass-panel p-8 rounded-none border-2 border-cyan-500/50 w-full max-w-lg shadow-[0_0_100px_rgba(34,211,238,0.2)] relative text-center">
                   {/* Decorative corners */}
                   <div className="absolute top-0 left-0 w-8 h-8 border-l-4 border-t-4 border-cyan-400"></div>
                   <div className="absolute top-0 right-0 w-8 h-8 border-r-4 border-t-4 border-cyan-400"></div>
                   <div className="absolute bottom-0 left-0 w-8 h-8 border-l-4 border-b-4 border-cyan-400"></div>
                   <div className="absolute bottom-0 right-0 w-8 h-8 border-r-4 border-b-4 border-cyan-400"></div>

                   {/* Skip Button */}
                   <button 
                      onClick={skipTutorial}
                      className="absolute top-4 right-4 text-xs text-cyan-700 hover:text-white uppercase tracking-widest"
                   >
                      [ Skip Protocol ]
                   </button>

                   {/* Progress Dots */}
                   <div className="flex justify-center gap-2 mb-6 mt-4">
                       {[1, 2, 3, 4].map(step => (
                           <div key={step} className={`w-2 h-2 rounded-full ${tutorialStep >= step ? 'bg-cyan-400 shadow-[0_0_10px_cyan]' : 'bg-slate-800'}`}></div>
                       ))}
                   </div>

                   {tutorialStep === 1 && (
                       <div className="space-y-6 animate-in fade-in zoom-in duration-300">
                           <ScanFace size={64} className="mx-auto text-cyan-400 animate-pulse" />
                           <h2 className="text-3xl font-bold text-cyan-400 tracking-[0.2em] uppercase">Initialising Link</h2>
                           <p className="text-cyan-100 text-lg">Welcome to AirType AI. <br/>Calibrating neural gesture interface.</p>
                           <button 
                                onClick={() => { playSound('step'); setTutorialStep(2); }}
                                className="px-8 py-3 bg-cyan-600 hover:bg-cyan-500 text-black font-bold tracking-widest uppercase rounded shadow-[0_0_20px_rgba(34,211,238,0.5)] transition-all"
                           >
                               Start Protocol
                           </button>
                       </div>
                   )}

                   {tutorialStep === 2 && (
                       <div className="space-y-6 animate-in fade-in slide-in-from-right-10 duration-300">
                           <Hand size={64} className="mx-auto text-green-400 animate-bounce" />
                           <h2 className="text-2xl font-bold text-green-400 tracking-widest uppercase">Motor Control</h2>
                           <p className="text-slate-300">Show <strong>5 FINGERS (OPEN HAND)</strong> to move the cursor.</p>
                           <div className="text-xs text-cyan-600 bg-cyan-950/30 p-2 border border-cyan-900/50 inline-block rounded">
                               STATUS: WAITING FOR MOVEMENT...
                           </div>
                       </div>
                   )}

                   {tutorialStep === 3 && (
                       <div className="space-y-6 animate-in fade-in slide-in-from-right-10 duration-300">
                           <MousePointer2 size={64} className="mx-auto text-cyan-400" />
                           <h2 className="text-2xl font-bold text-cyan-400 tracking-widest uppercase">Input Trigger</h2>
                           <p className="text-slate-300"><strong>PINCH (Thumb & Index)</strong> or use <strong>2 FINGERS</strong> to click keys.</p>
                           <div className="text-xs text-cyan-600 bg-cyan-950/30 p-2 border border-cyan-900/50 inline-block rounded">
                               STATUS: WAITING FOR GESTURE...
                           </div>
                       </div>
                   )}

                    {tutorialStep === 4 && (
                       <div className="space-y-6 animate-in fade-in slide-in-from-right-10 duration-300">
                           <BrainCircuit size={64} className="mx-auto text-purple-400" />
                           <h2 className="text-2xl font-bold text-purple-400 tracking-widest uppercase">AI Core Online</h2>
                           <p className="text-slate-300">Use <strong>AI FIX</strong> and <strong>COMPLETE</strong> to enhance typing speed.</p>
                           <button 
                                onClick={completeTutorial}
                                className="px-8 py-3 bg-cyan-600 hover:bg-cyan-500 text-black font-bold tracking-widest uppercase rounded shadow-[0_0_20px_rgba(34,211,238,0.5)] transition-all flex items-center gap-2 mx-auto"
                           >
                               <CheckCircle2 size={20} /> Complete
                           </button>
                       </div>
                   )}
              </div>
          </div>
      )}


      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 pointer-events-auto">
            <div className="glass-panel p-8 rounded-none border border-cyan-500/50 w-full max-w-sm shadow-[0_0_50px_rgba(34,211,238,0.2)] relative">
                <div className="absolute top-0 left-0 w-4 h-4 border-l-2 border-t-2 border-cyan-400"></div>
                <div className="absolute bottom-0 right-0 w-4 h-4 border-r-2 border-b-2 border-cyan-400"></div>

                <button 
                onClick={() => setShowSettings(false)}
                className="absolute top-4 right-4 text-cyan-700 hover:text-cyan-400 transition-colors"
                >
                <X size={24} />
                </button>
                <h2 className="text-xl font-bold mb-8 flex items-center gap-2 text-cyan-400 tracking-widest uppercase">
                <SlidersHorizontal size={20}/> CALIBRATION
                </h2>
                
                {/* Settings Controls */}
                <div className="space-y-8">
                    <div className="space-y-2">
                        <div className="flex justify-between items-center text-xs text-cyan-600 font-bold uppercase tracking-wider">
                            <span>Smoothing</span>
                            <span className="text-cyan-300">{(settings.cursorSmoothing * 100).toFixed(0)}%</span>
                        </div>
                        <input 
                            type="range" 
                            min="0.05" max="0.95" step="0.05"
                            value={settings.cursorSmoothing}
                            onChange={(e) => setSettings(p => ({...p, cursorSmoothing: parseFloat(e.target.value)}))}
                            className="w-full accent-cyan-400 h-1 bg-slate-800 rounded appearance-none cursor-pointer"
                        />
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between items-center text-xs text-cyan-600 font-bold uppercase tracking-wider">
                            <span>Pinch Threshold</span>
                            <span className="text-cyan-300">{(settings.pinchThreshold * 100).toFixed(1)}</span>
                        </div>
                        <input 
                            type="range" 
                            min="0.01" max="0.1" step="0.005"
                            value={settings.pinchThreshold}
                            onChange={(e) => setSettings(p => ({...p, pinchThreshold: parseFloat(e.target.value)}))}
                            className="w-full accent-cyan-400 h-1 bg-slate-800 rounded appearance-none cursor-pointer"
                        />
                    </div>

                     <div className="space-y-2">
                        <div className="flex justify-between items-center text-xs text-cyan-600 font-bold uppercase tracking-wider">
                            <span>Extension Bias</span>
                            <span className="text-cyan-300">{(settings.extensionThreshold * 100).toFixed(1)}</span>
                        </div>
                        <input 
                            type="range" 
                            min="-0.05" max="0.05" step="0.01"
                            value={settings.extensionThreshold}
                            onChange={(e) => setSettings(p => ({...p, extensionThreshold: parseFloat(e.target.value)}))}
                            className="w-full accent-cyan-400 h-1 bg-slate-800 rounded appearance-none cursor-pointer"
                        />
                    </div>

                    <div className="pt-4 border-t border-cyan-900/30">
                        <button 
                            onClick={() => { setShowSettings(false); setTutorialStep(1); }}
                            className="w-full py-2 bg-cyan-950 text-cyan-400 text-xs font-bold uppercase tracking-widest border border-cyan-800 hover:bg-cyan-900 transition-colors"
                        >
                            Reset Tutorial
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Loading State */}
      {appState === AppState.LOADING && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black text-white">
              <div className="flex flex-col items-center gap-6">
                  <div className="relative">
                      <div className="w-16 h-16 border-4 border-cyan-900 rounded-full animate-spin border-t-cyan-400"></div>
                      <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
                      </div>
                  </div>
                  <h2 className="text-xl font-bold tracking-[0.5em] text-cyan-500 animate-pulse">INITIALIZING</h2>
                  <p className="text-cyan-900 text-xs tracking-widest">ACCESSING OPTICAL SENSORS...</p>
              </div>
          </div>
      )}
      
       {appState === AppState.ERROR && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black text-red-500">
              <div className="border border-red-900/50 p-8 bg-red-950/10 backdrop-blur-md">
                  <h2 className="text-2xl font-bold tracking-widest mb-2">SYSTEM FAILURE</h2>
                  <p className="text-red-400 text-sm">CAMERA MODULE NOT DETECTED</p>
              </div>
          </div>
      )}

    </div>
  );
}

export default App;