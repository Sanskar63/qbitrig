import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RefreshCw, Move, Layers } from 'lucide-react';

// Color Palette based on the Qbit character
const COLORS = {
  hatBlue: '#0ea5e9',
  hatYellow: '#fbbf24',
  faceWhite: '#f1f5f9',
  coatBlue: '#0284c7',
  coatDarkBlue: '#0369a1',
  shirtOrange: '#f97316',
  chainSilver: '#cbd5e1',
  pantsBlue: '#0369a1',
  shoeBrown: '#78350f',
  eyeBlack: '#0f172a',
  badgeOrange: '#fbbf24'
};

const QbitAnimator = () => {
  // --- State for Animation Controls ---
  const [leftArmAngle, setLeftArmAngle] = useState(10);
  const [rightArmAngle, setRightArmAngle] = useState(-10);
  
  // Independent Leg Angles
  const [leftLegAngle, setLeftLegAngle] = useState(0);
  const [rightLegAngle, setRightLegAngle] = useState(0);
  
  const [legOffset, setLegOffset] = useState(0);
  const [hipsSway, setHipsSway] = useState(0); 
  const [headTilt, setHeadTilt] = useState(0);
  const [bodyRotation, setBodyRotation] = useState(0);
  
  // Spine & Coat Rigs
  const [torsoAngle, setTorsoAngle] = useState(0);
  const [coatFlap, setCoatFlap] = useState(0); 
  
  // Root transforms
  const [rootX, setRootX] = useState(0);
  const [rootY, setRootY] = useState(0); 
  
  // Expressions State
  const [isBlinking, setIsBlinking] = useState(false);
  const [blinkProgress, setBlinkProgress] = useState(0);
  const [isWinking, setIsWinking] = useState(false);
  const [winkProgress, setWinkProgress] = useState(0);
  const [isSad, setIsSad] = useState(false);
  const [showPoop, setShowPoop] = useState(false);
  const [handContactX, setHandContactX] = useState(0);
  const [handContactOpacity, setHandContactOpacity] = useState(0);

  // Auto-animation state
  const [isPlaying, setIsPlaying] = useState(false);
  const [animationType, setAnimationType] = useState('idle');
  const requestRef = useRef<number>();

  // --- Animation Loop ---
  const animate = (time: number) => {
    if (!isPlaying) return;
    
    const speed = 0.005;
    const t = time * speed;
    
    // Reset temporary states
    setBodyRotation(0);
    setRootX(0);
    setRootY(0); 
    setHipsSway(0);
    setShowPoop(false);
    let targetTorso = 0;
    let targetFlap = 0;

    if (animationType === 'idle') {
      setLeftArmAngle(10 + Math.sin(t) * 5);
      setRightArmAngle(-10 + Math.sin(t + Math.PI) * 5);
      setLeftLegAngle(0);
      setRightLegAngle(0);
      setHeadTilt(Math.sin(t * 0.5) * 2);
      setLegOffset(0);
      targetTorso = Math.sin(t) * 2; 
      targetFlap = 2 + Math.sin(t * 0.5);
    } else if (animationType === 'walk') {
      const legSwing = Math.sin(t * 4) * 25; 
      setLeftArmAngle(20 - legSwing); 
      setRightArmAngle(-20 + legSwing);
      setLeftLegAngle(legSwing);
      setRightLegAngle(-legSwing);
      setLegOffset(Math.abs(Math.sin(t * 4)) * 5);
      setHeadTilt(Math.sin(t * 8) * 2);
      targetTorso = 5; 
      targetFlap = 5 + Math.abs(Math.sin(t * 4)) * 5; 
    } else if (animationType === 'wave') {
      setRightArmAngle(-140 + Math.sin(t * 3) * 20);
      setLeftArmAngle(10);
      setLeftLegAngle(0);
      setRightLegAngle(0);
      setHeadTilt(5);
      setLegOffset(0);
      targetTorso = -2; 
    } else if (animationType === 'floss') {
      const flossSpeed = t * 2.4; 
      const phase = Math.sin(flossSpeed);
      setLegOffset(Math.abs(Math.sin(flossSpeed * 2)) * 3);
      setHeadTilt(phase * 5);
      setHipsSway(-phase * 15); 
      setLeftLegAngle(phase * 5);
      setRightLegAngle(phase * 5);
      if (phase > 0) {
        setLeftArmAngle(40 + phase * 20);
        setRightArmAngle(20 + phase * 20);
      } else {
        setLeftArmAngle(-20 + phase * 20);
        setRightArmAngle(-40 + phase * 20);
      }
      targetTorso = phase * 10;
      targetFlap = 10 + Math.abs(phase) * 5;
    } else if (animationType === 'cartwheel') {
      const cwSpeed = t * 0.3;
      const rotation = (cwSpeed % (Math.PI * 2));
      const rotationDeg = (rotation * 180 / Math.PI);
      
      setBodyRotation(rotationDeg);
      
      // Continuous lateral movement
      const lateralProgress = (cwSpeed / (Math.PI * 2)) % 1;
      setRootX(-100 + lateralProgress * 200);
      
      // Height - highest when inverted (90°)
      const yOffset = Math.sin(rotation) * 60;
      setRootY(Math.max(0, yOffset));
      
      // Arms reach toward ground during inverted phase
      const armPhase = Math.sin(rotation);
      setLeftArmAngle(-90 - armPhase * 70);
      setRightArmAngle(-90 - armPhase * 70);
      
      // Legs spread wide during inverted phase
      const legSpread = Math.abs(Math.sin(rotation)) * 50;
      setLeftLegAngle(-legSpread);
      setRightLegAngle(legSpread);
      
      // Head counter-rotation
      setHeadTilt(-rotationDeg * 0.3);
      
      // Coat flaps when inverted
      targetFlap = Math.abs(Math.sin(rotation)) * 15;
      
      // Hand contact shadow - visible when hands near ground (60°-120°)
      const handContact = Math.sin(rotation);
      setHandContactOpacity(handContact > 0.5 ? (handContact - 0.5) * 2 : 0);
      setHandContactX(200 + rootX);
    } else if (animationType === 'ophelia') {
      const slowT = t * 0.8;
      const sway = Math.sin(slowT);
      setHipsSway(sway * 25);
      setHeadTilt(-15 + Math.sin(slowT * 2) * 5);
      setLeftArmAngle(-100 + Math.sin(slowT) * 45);
      setRightArmAngle(-100 + Math.sin(slowT + 1.5) * 45);
      setLeftLegAngle(-sway * 10);
      setRightLegAngle(-sway * 10);
      setLegOffset(Math.abs(Math.sin(slowT * 2)) * 5);
      targetTorso = -10 + Math.cos(slowT) * 5;
      targetFlap = 8 + Math.sin(slowT * 2) * 4;
    } else if (animationType === 'poop') {
      const poopCycle = t % (Math.PI * 4);
      setLeftLegAngle(0);
      setRightLegAngle(0);
      if (poopCycle < Math.PI) { 
        setLegOffset(Math.sin(poopCycle/2) * 40);
        setLeftArmAngle(10 - Math.sin(poopCycle/2) * 30);
        setRightArmAngle(-10 + Math.sin(poopCycle/2) * 30);
        setHeadTilt(Math.sin(poopCycle) * 5);
        targetTorso = 15; 
        if (poopCycle > Math.PI * 0.8) setShowPoop(true);
      } else if (poopCycle < Math.PI * 3) { 
        setLegOffset(40);
        setLeftArmAngle(-20);
        setRightArmAngle(20);
        setHeadTilt(5);
        targetTorso = 20;
        setShowPoop(true);
      } else { 
        const standUpPhase = poopCycle - Math.PI * 3;
        setLegOffset(40 - Math.sin(standUpPhase/2) * 40);
        setLeftArmAngle(-20 + Math.sin(standUpPhase/2) * 30);
        setRightArmAngle(20 - Math.sin(standUpPhase/2) * 30);
        setHeadTilt(5 - Math.sin(standUpPhase/2) * 5);
        targetTorso = 20 - Math.sin(standUpPhase/2) * 20;
        setShowPoop(false);
      }
    } else if (animationType === 'winning') {
      const jumpSpeed = t * 3.5;
      setLegOffset(Math.abs(Math.sin(jumpSpeed)) * 15);
      setHeadTilt(-10 + Math.sin(jumpSpeed) * 5);
      const landing = Math.max(0, -Math.sin(jumpSpeed));
      setLeftLegAngle(-landing * 10);
      setRightLegAngle(landing * 10);
      setLeftArmAngle(-140 + Math.sin(jumpSpeed) * 10);
      setRightArmAngle(-140 + Math.sin(jumpSpeed) * 10);
      targetTorso = -10;
      targetFlap = 15 + Math.sin(jumpSpeed) * 10;
    }

    setTorsoAngle(targetTorso);
    setCoatFlap(targetFlap);

    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(animate);
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      setBodyRotation(0);
      setShowPoop(false);
      setRootX(0);
      setRootY(0);
      setHipsSway(0);
      setLeftLegAngle(0);
      setRightLegAngle(0);
      setTorsoAngle(0);
      setCoatFlap(0);
      setHandContactOpacity(0);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, animationType]);

  // --- Expression Logic ---
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      if (Math.random() > 0.7 && !isBlinking && !isWinking) {
        triggerBlink();
      }
    }, 3000);
    return () => clearInterval(blinkInterval);
  }, [isBlinking, isWinking]);

  const animateExpression = (
    setFlag: React.Dispatch<React.SetStateAction<boolean>>, 
    setProgress: React.Dispatch<React.SetStateAction<number>>
  ) => {
    setFlag(true);
    let start: number | null = null;
    const duration = 200;
    const animateFrame = (timestamp: number) => {
      if (!start) start = timestamp;
      const progress = timestamp - start;
      let val = 0;
      if (progress < duration / 2) {
        val = (progress / (duration / 2));
      } else {
        val = 1 - ((progress - duration/2) / (duration / 2));
      }
      setProgress(Math.max(0, Math.min(1, val)));
      if (progress < duration) requestAnimationFrame(animateFrame);
      else { setFlag(false); setProgress(0); }
    };
    requestAnimationFrame(animateFrame);
  };

  const triggerBlink = () => animateExpression(setIsBlinking, setBlinkProgress);

  const resetPose = () => {
    setIsPlaying(false);
    setLeftArmAngle(10);
    setRightArmAngle(-10);
    setLegOffset(0);
    setHeadTilt(0);
    setBodyRotation(0);
    setRootY(0);
    setIsSad(false);
    setShowPoop(false);
    setHipsSway(0);
    setLeftLegAngle(0);
    setRightLegAngle(0);
    setTorsoAngle(0);
    setCoatFlap(0);
  };

  // --- RIG COMPONENTS ---
  
  const SkeletonRig = () => (
    <div className="skeleton-overlay">
       <div className="text-[10px] text-muted-foreground mb-2 uppercase tracking-wider font-bold border-b border-border pb-1 flex items-center gap-2">
         <Layers size={10} /> Skeleton Rig
       </div>
       <svg width="80" height="100" viewBox="0 0 100 120" className="opacity-90">
         <g transform={`translate(50, 60) translate(${rootX/4}, ${rootY/4}) rotate(${bodyRotation})`}>
            <line x1="-10" y1="0" x2="10" y2="0" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round" />
            <circle cx="0" cy="0" r="3" fill="hsl(var(--primary))" />
            
            <g transform={`translate(-8, 0) rotate(${leftLegAngle})`}>
               <line x1="0" y1="0" x2="0" y2="25" stroke="#86efac" strokeWidth="2" strokeLinecap="round" />
               <circle cx="0" cy="25" r="2" fill="#86efac" />
            </g>
            <g transform={`translate(8, 0) rotate(${rightLegAngle})`}>
               <line x1="0" y1="0" x2="0" y2="25" stroke="#86efac" strokeWidth="2" strokeLinecap="round" />
               <circle cx="0" cy="25" r="2" fill="#86efac" />
            </g>

            <g transform={`rotate(${torsoAngle})`}>
               <line x1="0" y1="0" x2="0" y2="-30" stroke="hsl(var(--accent))" strokeWidth="2" strokeLinecap="round" />
               <line x1="-14" y1="-30" x2="14" y2="-30" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round" />
               
               <g transform={`translate(0, -35) rotate(${headTilt})`}>
                 <circle cx="0" cy="0" r="8" stroke="white" strokeWidth="1.5" fill="rgba(255,255,255,0.2)" />
                 <line x1="0" y1="0" x2="6" y2="0" stroke="white" strokeWidth="1" />
               </g>

               <g transform={`translate(-12, -30) rotate(${leftArmAngle})`}>
                  <line x1="0" y1="0" x2="0" y2="30" stroke="#f472b6" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="0" cy="30" r="2.5" fill="#f472b6" />
               </g>
               <g transform={`translate(12, -30) rotate(${rightArmAngle})`}>
                  <line x1="0" y1="0" x2="0" y2="30" stroke="#f472b6" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="0" cy="30" r="2.5" fill="#f472b6" />
               </g>
            </g>
         </g>
       </svg>
    </div>
  );

  const Shadow = () => (
    <ellipse cx="200" cy="380" rx="60" ry="10" fill="rgba(0,0,0,0.2)" />
  );

  const Poop = () => (
    <text x="185" y="395" fontSize="30">💩</text>
  );

  const Hips = () => (
    <g transform={`translate(${hipsSway}, ${-legOffset})`}>
       <path d="M175,310 H225 V330 Q225,340 215,340 H185 Q175,340 175,330 Z" fill={COLORS.pantsBlue} />
    </g>
  );

  const LeftLeg = () => (
    <g transform={`translate(185, 320) translate(${hipsSway}, ${-legOffset}) rotate(${leftLegAngle}) translate(-185, -320)`}>
      <rect x="175" y="320" width="20" height="40" rx="5" fill={COLORS.pantsBlue} />
      <path d="M170,360 h30 v10 a5,5 0 0 1 -5,5 h-20 a5,5 0 0 1 -5,-5 z" fill={COLORS.shoeBrown} />
    </g>
  );

  const RightLeg = () => (
    <g transform={`translate(215, 320) translate(${hipsSway}, ${-legOffset}) rotate(${rightLegAngle}) translate(-215, -320)`}>
      <rect x="205" y="320" width="20" height="40" rx="5" fill={COLORS.pantsBlue} />
      <path d="M200,360 h30 v10 a5,5 0 0 1 -5,5 h-20 a5,5 0 0 1 -5,-5 z" fill={COLORS.shoeBrown} />
    </g>
  );

  const Body = () => {
    const flare = coatFlap;
    return (
      <g>
        <path d={`M160,250 Q${150-flare},330 ${160-flare},340 H${240+flare} Q${250+flare},330 240,250 Z`} fill={COLORS.coatDarkBlue} />
        <rect x="185" y="240" width="30" height="90" fill={COLORS.shirtOrange} />
        <path d={`M160,240 Q${155-flare},330 ${170-flare},335 L185,335 L185,240 Z`} fill={COLORS.coatBlue} />
        <path d={`M240,240 Q${245+flare},330 ${230+flare},335 L215,335 L215,240 Z`} fill={COLORS.coatBlue} />
        <path d="M160,240 L150,230 L250,230 L240,240 Z" fill={COLORS.coatDarkBlue} />
        <g transform="translate(200, 245) scale(0.6)">
           <path d="M-40,0 Q0,25 40,0" fill="none" stroke={COLORS.chainSilver} strokeWidth="8" strokeLinecap="round" strokeDasharray="1 10" />
           <circle cx="-30" cy="5" r="5" fill="none" stroke={COLORS.chainSilver} strokeWidth="3" />
           <circle cx="-10" cy="12" r="5" fill="none" stroke={COLORS.chainSilver} strokeWidth="3" />
           <circle cx="10" cy="12" r="5" fill="none" stroke={COLORS.chainSilver} strokeWidth="3" />
           <circle cx="30" cy="5" r="5" fill="none" stroke={COLORS.chainSilver} strokeWidth="3" />
        </g>
      </g>
    );
  };

  const LeftArm = () => (
    <g transform={`translate(175, 245) rotate(${leftArmAngle}) translate(-175, -245)`}>
      <path d="M165,245 L155,300 A10,10 0 0 0 175,300 L185,245 Z" fill={COLORS.coatBlue} />
      <circle cx="165" cy="305" r="8" fill={COLORS.faceWhite} />
    </g>
  );

  const RightArm = () => (
    <g transform={`translate(225, 245) rotate(${rightArmAngle}) translate(-225, -245)`}>
      <path d="M215,245 L225,300 A10,10 0 0 0 245,300 L235,245 Z" fill={COLORS.coatBlue} />
      <circle cx="225" cy="245" r="10" fill={COLORS.coatBlue} />
      <circle cx="235" cy="305" r="8" fill={COLORS.faceWhite} />
    </g>
  );

  const Head = () => (
    <g transform={`translate(200, 230) rotate(${headTilt}) translate(-200, -230)`}>
      <rect x="160" y="170" width="80" height="70" rx="35" fill={COLORS.faceWhite} />
      <g>
        <ellipse cx="185" cy={isSad ? 208 : 205} rx="5" ry="8" fill={COLORS.eyeBlack} transform={isSad ? "rotate(-10 185 208)" : ""} />
        <path d={`M175,205 h20 a1,1 0 0 0 -20,0`} fill={COLORS.faceWhite} style={{ transformOrigin: '185px 205px', transform: `scaleY(${blinkProgress})` }} />
        <ellipse cx="215" cy={isSad ? 208 : 205} rx="5" ry="8" fill={COLORS.eyeBlack} transform={isSad ? "rotate(10 215 208)" : ""} />
        <path d={`M205,205 h20 a1,1 0 0 0 -20,0`} fill={COLORS.faceWhite} style={{ transformOrigin: '215px 205px', transform: `scaleY(${Math.max(blinkProgress, winkProgress)})` }} />
      </g>
      <path d="M160,180 V160 Q160,130 200,130 Q240,130 240,160 V180 H160" fill={COLORS.hatBlue} />
      <path d="M150,180 H250 V190 Q250,200 240,200 H160 Q150,200 150,190 Z" fill={COLORS.hatYellow} />
      <circle cx="200" cy="160" r="12" fill={COLORS.badgeOrange} />
      <g transform={isSad ? "translate(200, 160) rotate(180) translate(-200, -160)" : ""}>
        <circle cx="196" cy="158" r="1.5" fill="#5D4037" />
        <circle cx="204" cy="158" r="1.5" fill="#5D4037" />
        <path d="M196,162 Q200,166 204,162" fill="none" stroke="#5D4037" strokeWidth="1.5" strokeLinecap="round" />
      </g>
    </g>
  );

  const AnimationButton = ({ type, label }: { type: string; label: string }) => (
    <button 
      onClick={() => { setIsPlaying(true); setAnimationType(type); }}
      className={`animation-btn ${isPlaying && animationType === type ? 'animation-btn-active' : ''}`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col md:flex-row h-screen bg-background text-foreground overflow-hidden">
      
      {/* --- Visualizer Stage --- */}
      <div className="flex-1 flex flex-col items-center justify-center animator-stage p-4">
        <SkeletonRig />

        <div className="stage-badge">
          Qbit Animator v1.8
        </div>
        
        {/* The SVG Rig */}
        <div className="character-stage">
           <svg width="400" height="400" viewBox="0 0 400 400" className="overflow-visible">
              <defs>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>
              <Shadow />
              {handContactOpacity > 0 && (
                <ellipse 
                  cx={handContactX} 
                  cy="378" 
                  rx={12 + handContactOpacity * 8} 
                  ry={4 + handContactOpacity * 2} 
                  fill={`rgba(0,0,0,${handContactOpacity * 0.4})`} 
                />
              )}
              {showPoop && <Poop />}
              <g transform={`translate(${rootX}, ${rootY}) rotate(${bodyRotation} 200 370)`}>
                <LeftLeg />
                <RightLeg />
                <Hips />
                <g transform={`translate(0, ${-legOffset}) rotate(${torsoAngle} 200 320)`}>
                    <LeftArm />
                    <Body />
                    <RightArm />
                    <Head />
                </g>
              </g>
           </svg>
        </div>
      </div>

      {/* --- Controls Panel --- */}
      <div className="w-full md:w-80 control-panel z-10 shadow-xl">
        <div className="flex items-center gap-2 mb-2">
           <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
             <Move size={18} className="text-primary-foreground" />
           </div>
           <h1 className="text-xl font-bold tracking-tight">Rig Controls</h1>
        </div>

        {/* Animation Presets */}
        <div className="space-y-3">
          <label className="control-label">Auto Animate</label>
          <div className="grid grid-cols-3 gap-2">
            <AnimationButton type="idle" label="Idle" />
            <AnimationButton type="walk" label="Walk" />
            <AnimationButton type="wave" label="Wave" />
            <AnimationButton type="floss" label="Floss" />
            <AnimationButton type="cartwheel" label="Slow Wheel" />
            <AnimationButton type="winning" label="Winning" />
            <AnimationButton type="ophelia" label="Fate of Ophelia" />
            <AnimationButton type="poop" label="Poop" />
          </div>
          <div className="flex gap-2 mt-2">
             <button 
                onClick={() => setIsPlaying(!isPlaying)}
                className="flex-1 control-btn"
             >
                {isPlaying ? <><Pause size={16} /> Pause</> : <><Play size={16} /> Play</>}
             </button>
             <button 
                onClick={resetPose}
                className="px-3 control-btn"
                title="Reset Pose"
             >
                <RefreshCw size={16} />
             </button>
          </div>
        </div>

        <hr className="border-border" />

        {/* Manual Controls */}
        <div className={`space-y-6 transition-opacity ${isPlaying ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
           <label className="control-label">Manual Pose</label>

           {/* Arms */}
           <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between text-xs mb-1 text-muted-foreground">
                      <span>L Arm</span>
                  </div>
                  <input 
                    type="range" min="-60" max="160" 
                    value={leftArmAngle} 
                    onChange={(e) => setLeftArmAngle(parseFloat(e.target.value))}
                    className="slider-track accent-primary"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1 text-muted-foreground">
                      <span>R Arm</span>
                  </div>
                  <input 
                    type="range" min="-160" max="60" 
                    value={rightArmAngle} 
                    onChange={(e) => setRightArmAngle(parseFloat(e.target.value))}
                    className="slider-track accent-primary"
                  />
                </div>
              </div>

              {/* Legs */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between text-xs mb-1 text-muted-foreground">
                      <span>L Leg</span>
                  </div>
                  <input 
                    type="range" min="-60" max="60" 
                    value={leftLegAngle} 
                    onChange={(e) => setLeftLegAngle(parseFloat(e.target.value))}
                    className="slider-track accent-primary"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1 text-muted-foreground">
                      <span>R Leg</span>
                  </div>
                  <input 
                    type="range" min="-60" max="60" 
                    value={rightLegAngle} 
                    onChange={(e) => setRightLegAngle(parseFloat(e.target.value))}
                    className="slider-track accent-primary"
                  />
                </div>
              </div>
           </div>

           {/* Body & Coat */}
           <div className="space-y-4">
             <div>
                <div className="flex justify-between text-sm mb-1 text-muted-foreground">
                    <span>Torso Bend</span>
                </div>
                <input 
                  type="range" min="-30" max="30" 
                  value={torsoAngle} 
                  onChange={(e) => setTorsoAngle(parseFloat(e.target.value))}
                  className="slider-track accent-primary"
                />
             </div>
             <div>
                <div className="flex justify-between text-sm mb-1 text-muted-foreground">
                    <span>Coat Flap</span>
                </div>
                <input 
                  type="range" min="0" max="40" 
                  value={coatFlap} 
                  onChange={(e) => setCoatFlap(parseFloat(e.target.value))}
                  className="slider-track accent-primary"
                />
             </div>
           </div>

           {/* Height & Head */}
           <div className="space-y-4">
             <div>
                <div className="flex justify-between text-sm mb-1 text-muted-foreground">
                    <span>Bounce / Height</span>
                </div>
                <input 
                  type="range" min="0" max="40" 
                  value={legOffset} 
                  onChange={(e) => setLegOffset(parseFloat(e.target.value))}
                  className="slider-track accent-primary"
                />
             </div>
             <div>
                <div className="flex justify-between text-sm mb-1 text-muted-foreground">
                    <span>Head Tilt</span>
                </div>
                <input 
                  type="range" min="-20" max="20" 
                  value={headTilt} 
                  onChange={(e) => setHeadTilt(parseFloat(e.target.value))}
                  className="slider-track accent-primary"
                />
             </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default QbitAnimator;
