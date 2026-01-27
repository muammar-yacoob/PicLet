/**
 * LottiePlayer - React-safe wrapper for @lottiefiles/lottie-player
 * Self-contained, reusable component for any React project.
 *
 * DEPENDENCIES:
 *   - React (as global or imported)
 *   - @lottiefiles/lottie-player script: <script src="https://unpkg.com/@lottiefiles/lottie-player@latest/dist/lottie-player.js"></script>
 *
 * PROBLEM: The lottie-player web component conflicts with React's reconciliation.
 * When React tries to unmount a component containing lottie-player, it throws:
 * "Failed to execute 'removeChild' on 'Node'"
 *
 * SOLUTION: This wrapper creates the lottie-player element via DOM APIs,
 * completely isolating it from React's virtual DOM.
 *
 * USAGE:
 *   <LottiePlayer
 *     src="/animations/example.json"
 *     autoplay
 *     loop
 *     style={{ width: 200, height: 200 }}
 *   />
 *
 * With replay interval:
 *   <LottiePlayer
 *     src="/animations/example.json"
 *     autoplay
 *     replayInterval={3000}
 *   />
 *
 * With ref for imperative control:
 *   const ref = useRef();
 *   <LottiePlayer ref={ref} src="..." />
 *   // Then: ref.current.play(), ref.current.pause(), etc.
 */

const LottiePlayer = React.forwardRef(({
   src,
   autoplay = false,
   loop = false,
   speed = 1,
   background = 'transparent',
   style = {},
   className = '',
   replayInterval = null,
   onLoad = null,
   onComplete = null,
   onError = null,
 }, ref) => {
   const containerRef = React.useRef(null);
   const playerRef = React.useRef(null);
   const intervalRef = React.useRef(null);
 
   // Expose imperative methods via ref
   React.useImperativeHandle(ref, () => ({
     play: () => playerRef.current?.play?.(),
     pause: () => playerRef.current?.pause?.(),
     stop: () => playerRef.current?.stop?.(),
     seek: (frame) => playerRef.current?.seek?.(frame),
     setSpeed: (s) => playerRef.current?.setSpeed?.(s),
     setDirection: (d) => playerRef.current?.setDirection?.(d),
     getPlayer: () => playerRef.current,
   }), []);
 
   // Create and manage lottie-player element
   React.useEffect(() => {
     const container = containerRef.current;
     if (!container || !src) return;
 
     // Create lottie-player via DOM API
     const player = document.createElement('lottie-player');
     player.setAttribute('src', src);
     player.setAttribute('background', background);
     player.setAttribute('speed', String(speed));
     if (autoplay) player.setAttribute('autoplay', '');
     if (loop) player.setAttribute('loop', '');
 
     // Sizing
     player.style.width = '100%';
     player.style.height = '100%';
     player.style.display = 'block';
 
     // Event listeners
     const handleReady = () => onLoad?.();
     const handleComplete = () => onComplete?.();
     const handleError = () => onError?.();
 
     player.addEventListener('ready', handleReady);
     player.addEventListener('complete', handleComplete);
     player.addEventListener('error', handleError);
 
     // Append to container
     container.appendChild(player);
     playerRef.current = player;
 
     // Setup replay interval
     if (replayInterval && replayInterval > 0) {
       intervalRef.current = setInterval(() => {
         if (player.seek) player.seek(0);
         if (player.play) player.play();
       }, replayInterval);
     }
 
     // Cleanup
     return () => {
       // Clear interval first
       if (intervalRef.current) {
         clearInterval(intervalRef.current);
         intervalRef.current = null;
       }
 
       // Remove event listeners
       player.removeEventListener('ready', handleReady);
       player.removeEventListener('complete', handleComplete);
       player.removeEventListener('error', handleError);
 
       // Remove player from DOM
       if (container.contains(player)) {
         container.removeChild(player);
       }
       playerRef.current = null;
     };
   }, [src]); // Only recreate on src change
 
   // Update attributes when props change
   React.useEffect(() => {
     const player = playerRef.current;
     if (!player) return;
 
     player.setAttribute('speed', String(speed));
     player.setAttribute('background', background);
 
     if (loop) player.setAttribute('loop', '');
     else player.removeAttribute('loop');
   }, [speed, background, loop]);
 
   // Handle autoplay changes
   React.useEffect(() => {
     const player = playerRef.current;
     if (!player) return;
 
     if (autoplay) {
       player.setAttribute('autoplay', '');
       player.play?.();
     } else {
       player.removeAttribute('autoplay');
       player.pause?.();
     }
   }, [autoplay]);
 
   // Handle replay interval changes
   React.useEffect(() => {
     if (intervalRef.current) {
       clearInterval(intervalRef.current);
       intervalRef.current = null;
     }
 
     if (replayInterval && replayInterval > 0 && playerRef.current) {
       intervalRef.current = setInterval(() => {
         const player = playerRef.current;
         if (player?.seek) player.seek(0);
         if (player?.play) player.play();
       }, replayInterval);
     }
 
     return () => {
       if (intervalRef.current) {
         clearInterval(intervalRef.current);
       }
     };
   }, [replayInterval]);
 
   return (
     <div
       ref={containerRef}
       className={className}
       style={{
         display: 'inline-block',
         lineHeight: 0,
         ...style,
       }}
     />
   );
 });
 
 LottiePlayer.displayName = 'LottiePlayer';
 
 /**
  * Utility: Show a lottie animation in a modal using pure DOM (no React)
  * Useful for welcome screens or loading overlays where React conflicts occur.
  *
  * @param {Object} options
  * @param {string} options.src - Path to lottie JSON
  * @param {string} options.title - Modal title
  * @param {string} options.subtitle - Modal subtitle
  * @param {string} options.buttonText - Button text
  * @param {number} options.replayInterval - Replay interval in ms
  * @param {Array} options.features - Array of {icon, text} for feature list
  * @returns {Promise} Resolves when user clicks the button
  */
 function showLottieModal(options = {}) {
   const {
     src,
     title = '',
     subtitle = '',
     buttonText = 'Continue',
     buttonClass = 'btn-primary btn-lg',
     replayInterval = 0,
     features = [],
     modalClass = 'modal-sm',
     overlayClass = '',
   } = options;
 
   return new Promise((resolve) => {
     const overlay = document.createElement('div');
     overlay.className = `modal-overlay ${overlayClass}`;
 
     const featuresHtml = features.length > 0
       ? `<div class="welcome-features">
           ${features.map(f => `
             <div class="welcome-feature">
               <i data-lucide="${f.icon}"></i>
               <span>${f.text}</span>
             </div>
           `).join('')}
         </div>`
       : '';
 
     overlay.innerHTML = `
       <div class="modal ${modalClass}">
         <div class="first-app-welcome">
           <div class="welcome-animation-container">
             <lottie-player
               src="${src}"
               background="transparent"
               speed="1"
               autoplay
               class="welcome-animation"
             ></lottie-player>
           </div>
           ${title ? `<h2>${title}</h2>` : ''}
           ${subtitle ? `<p>${subtitle}</p>` : ''}
           ${featuresHtml}
           <button type="button" class="${buttonClass}" id="lottie-modal-btn">
             ${buttonText}
           </button>
         </div>
       </div>
     `;
 
     document.body.appendChild(overlay);
 
     // Initialize lucide icons if available
     if (window.lucide) window.lucide.createIcons();
 
     // Setup replay interval
     let interval = null;
     if (replayInterval > 0) {
       const player = overlay.querySelector('lottie-player');
       interval = setInterval(() => {
         if (player?.seek) player.seek(0);
         if (player?.play) player.play();
       }, replayInterval);
     }
 
     // Handle button click
     const button = overlay.querySelector('#lottie-modal-btn');
     button.addEventListener('click', () => {
       if (interval) clearInterval(interval);
       overlay.remove();
       resolve();
     });
   });
 }
 
 // Export to window for browser usage
 if (typeof window !== 'undefined') {
   window.LottiePlayer = LottiePlayer;
   window.showLottieModal = showLottieModal;
 }
 