import React, { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import gsap from 'gsap'
import './Hero.css'
import Navbar from './Navbar'

const Hero = () => {
  const heroRef        = useRef(null)
  const maskRevealRef  = useRef(null)
  const rpmBarsRef     = useRef(null)
  const animStateRef   = useRef({ t: 0, animId: null })
  const [epMuted, setEpMuted] = useState(true)
  const epIframeRef = useRef(null)
  const YT_VIDEO_ID = 'wF__m76ExlE'

  /* ── Sync mute/unmute to the YouTube iframe via postMessage ── */
  useEffect(() => {
    const iframe = epIframeRef.current
    if (!iframe) return
    const cmd = epMuted
      ? '{"event":"command","func":"mute","args":""}'
      : '{"event":"command","func":"unMute","args":""}'
    iframe.contentWindow?.postMessage(cmd, '*')
  }, [epMuted])

  /* ── Liquid Mask Reveal — WebGL fluid simulation ── */
  useEffect(() => {
    const hero   = heroRef.current
    const canvas = maskRevealRef.current
    if (!hero || !canvas) return

    const SIM = 512

    // ── WebGL setup ───────────────────────────────────────────
    const gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: true })
    if (!gl) return

    // Float texture support
    gl.getExtension('OES_texture_float')
    gl.getExtension('OES_texture_float_linear')

    function resize() {
      canvas.width  = hero.offsetWidth
      canvas.height = hero.offsetHeight
      gl.viewport(0, 0, canvas.width, canvas.height)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(hero)

    // ── Helpers ───────────────────────────────────────────────
    function compile(type, src) {
      const s = gl.createShader(type)
      gl.shaderSource(s, src); gl.compileShader(s); return s
    }
    function makeProgram(vs, fs) {
      const p = gl.createProgram()
      gl.attachShader(p, compile(gl.VERTEX_SHADER, vs))
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs))
      gl.linkProgram(p); return p
    }
    function makeFBO() {
      const tex = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SIM, SIM, 0, gl.RGBA, gl.FLOAT, null)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      const fbo = gl.createFramebuffer()
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
      // Clear to zero
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT)
      return { tex, fbo }
    }

    // ── Full-screen quad ──────────────────────────────────────
    const quadBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1,-1, 1,-1, -1,1,  -1,1, 1,-1, 1,1
    ]), gl.STATIC_DRAW)

    const fbos = [makeFBO(), makeFBO()]
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)

    // ── Vertex shader (shared) ────────────────────────────────
    const VS = `
      attribute vec2 aPos;
      varying vec2 vUv;
      void main(){
        vUv = aPos * 0.5 + 0.5;
        gl_Position = vec4(aPos, 0.0, 1.0);
      }
    `

    // ── Fluid simulation shader ───────────────────────────────
    // Faithful port of index.tsx fluidUpdateShader
    // Key fix: use neighbors*2.0-prev (correct wave eq) + viscosity mix
    const FLUID_FS = `
      precision highp float;
      uniform sampler2D uCurr;
      uniform vec2 uResolution;
      uniform float uDecay;
      uniform vec2 uMouse;
      uniform vec2 uPrevMouse;
      uniform float uRadius;
      uniform float uIntensity;
      uniform float uMouseVelocity;
      varying vec2 vUv;

      void main(){
        vec2 texel = 1.0 / uResolution;

        float current  = texture2D(uCurr, vUv).r;
        float left     = texture2D(uCurr, vUv + vec2(-texel.x, 0.0)).r;
        float right    = texture2D(uCurr, vUv + vec2( texel.x, 0.0)).r;
        float top      = texture2D(uCurr, vUv + vec2(0.0,  texel.y)).r;
        float bottom   = texture2D(uCurr, vUv + vec2(0.0, -texel.y)).r;

        // Blur + decay — no wave propagation, cannot self-sustain.
        // Effect exists ONLY while mouse is moving. When mouse stops,
        // energy gently diffuses and fades away smoothly on its own.
        float blurred = (current + left + right + top + bottom) * 0.2;
        float wave = blurred * uDecay;

        // Ripple injection along mouse trail
        if(uMouseVelocity > 0.0001){
          float ripple = smoothstep(uRadius, 0.0, distance(vUv, uMouse));
          ripple = pow(ripple, 2.0);
          for(float i = 0.0; i < 8.0; i++){
            float t = i / 8.0;
            vec2 trailPos = mix(uPrevMouse, uMouse, t);
            float d = distance(vUv, trailPos);
            float tr = smoothstep(uRadius * 0.7, 0.0, d);
            ripple = max(ripple, pow(tr, 2.0));
          }
          wave += ripple * uIntensity * min(uMouseVelocity * 10.0, 1.0);
        }

        gl_FragColor = vec4(wave, wave, wave, 1.0);
      }
    `

    // ── Display / mask shader ─────────────────────────────────
    const DISPLAY_FS = `
      precision highp float;
      uniform sampler2D uDisp;
      uniform sampler2D uReveal;
      uniform vec2 uResolution;
      uniform float uRevealSize;
      uniform float uEdgeSoftness;
      uniform float uLightIntensity;
      uniform float uSpecularPower;
      varying vec2 vUv;

      vec3 calcNormal(vec2 uv){
        vec2 texel = 1.0 / uResolution;
        float L = texture2D(uDisp, uv + vec2(-texel.x, 0.0)).r;
        float R = texture2D(uDisp, uv + vec2( texel.x, 0.0)).r;
        float T = texture2D(uDisp, uv + vec2(0.0,  texel.y)).r;
        float B = texture2D(uDisp, uv + vec2(0.0, -texel.y)).r;
        return normalize(vec3((L - R) * 40.0, (B - T) * 40.0, 1.0));
      }

      uniform float uCanvasAspect;
      uniform float uImageAspect;

      void main(){
        float displacement = texture2D(uDisp, vUv).r;

        // Y-flip: WebGL loads textures upside-down vs CSS
        vec2 flipped = vec2(vUv.x, 1.0 - vUv.y);

        // "Cover" fit: crop the image instead of stretching it to
        // whatever the canvas aspect ratio happens to be (matches
        // CSS background-size: cover behaviour) — this is what
        // keeps the reveal image looking correct on tall mobile
        // screens instead of squashed/stretched.
        vec2 ratio = vec2(
          min(uCanvasAspect / uImageAspect, 1.0),
          min(uImageAspect / uCanvasAspect, 1.0)
        );
        vec2 revUv = vec2(
          flipped.x * ratio.x + (1.0 - ratio.x) * 0.5,
          flipped.y * ratio.y + (1.0 - ratio.y) * 0.5
        );
        vec4 revealColor = texture2D(uReveal, revUv);

        // Clear, strong mask from displacement amplitude
        float mask = clamp(displacement * uRevealSize, 0.0, 1.0);
        mask = smoothstep(0.0, uEdgeSoftness, mask);

        // Subtle specular highlight tracing the wave ridges
        vec3  normal     = calcNormal(vUv);
        float normalDev  = length(normal.xy);
        float rippleMask = smoothstep(0.02, 0.12, normalDev);
        vec3  lightDir   = normalize(vec3(0.5, 0.5, 1.0));
        vec3  viewDir    = vec3(0.0, 0.0, 1.0);
        vec3  halfDir    = normalize(lightDir + viewDir);
        float spec       = pow(max(dot(normal, halfDir), 0.0), uSpecularPower);
        spec *= uLightIntensity * rippleMask;

        vec3 color = revealColor.rgb + vec3(spec);
        gl_FragColor = vec4(color, mask);
      }
    `

    const fluidProg   = makeProgram(VS, FLUID_FS)
    const displayProg = makeProgram(VS, DISPLAY_FS)

    // ── Reveal image texture ──────────────────────────────────
    const revealTex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, revealTex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = '/images/back-img.png'
    let imageAspect = 1
    img.onload = () => {
      imageAspect = img.naturalWidth / img.naturalHeight || 1
      gl.bindTexture(gl.TEXTURE_2D, revealTex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
    }

    // ── Mouse tracking ────────────────────────────────────────
    const mouse     = { x: 0.5, y: 0.5 }
    const prevMouse = { x: 0.5, y: 0.5 }
    let velocity       = 0
    let smoothVelocity = 0  // tapers gently to zero when mouse stops
    let isInside       = false
    let lastMoveTime   = 0

    const onMove = (e) => {
      const r = hero.getBoundingClientRect()
      mouse.x = (e.clientX - r.left) / r.width
      mouse.y = 1.0 - (e.clientY - r.top) / r.height
      isInside = true
      lastMoveTime = performance.now()
    }
    const onLeave = () => { isInside = false; lastMoveTime = 0 }
    const onTouch = (e) => {
      if (e.touches.length > 0) {
        const r = hero.getBoundingClientRect()
        mouse.x = (e.touches[0].clientX - r.left) / r.width
        mouse.y = 1.0 - (e.touches[0].clientY - r.top) / r.height
        isInside = true
      }
    }
    hero.addEventListener('mousemove', onMove)
    hero.addEventListener('mouseleave', onLeave)
    hero.addEventListener('touchmove', onTouch, { passive: true })
    hero.addEventListener('touchend', onLeave)

    // ── Render helpers ────────────────────────────────────────
    function bindQuad(prog) {
      const loc = gl.getAttribLocation(prog, 'aPos')
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf)
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    }
    function setTex(prog, name, unit, tex) {
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.uniform1i(gl.getUniformLocation(prog, name), unit)
    }
    function setf(prog, name, val) {
      gl.uniform1f(gl.getUniformLocation(prog, name), val)
    }
    function set2f(prog, name, x, y) {
      gl.uniform2f(gl.getUniformLocation(prog, name), x, y)
    }

    // ── Simulation settings (matching index.tsx defaults) ─────
    const DECAY      = 0.96
    
// energy loss per step — gentle fade
    const RADIUS     = 0.13// ripple injection radius in UV space
    const INTENSITY  = 0.35   // ripple strength — clear but not noisy
    // Display settings
    const DISTORTION    = 0.20 // lens refraction amount
    const REVEAL_SIZE   = 9.0 // multiplier on displacement for mask size
    const EDGE_SOFTNESS = 0.42 // smooth mask edge
    const LIGHT         = 0.0 // specular brightness
    const SPEC_POWER    = 83.0 // specular tightness

    // ── Render loop ───────────────────────────────────────────
    let ping = 0
    let frameId

    function loop() {
      frameId = requestAnimationFrame(loop)

      // Actual mouse velocity — only when genuinely moving
      const dx = mouse.x - prevMouse.x
      const dy = mouse.y - prevMouse.y
      const isMoving = isInside && (performance.now() - lastMoveTime) < 80
      velocity = isMoving ? Math.sqrt(dx * dx + dy * dy) : 0

      // smoothVelocity: snaps up fast when moving, tapers very slowly to zero
      // when stopped — this is what makes the stop feel smooth and gentle
      const lerpRate = velocity > smoothVelocity ? 0.3 : 0.000
      smoothVelocity += (velocity - smoothVelocity) * lerpRate

      const curr = ping
      const next = 1 - ping

      // ── 1. Fluid simulation step ──────────────────────────
      gl.useProgram(fluidProg)
      bindQuad(fluidProg)
      setTex(fluidProg, 'uCurr', 0, fbos[curr].tex)
      set2f(fluidProg, 'uResolution',    SIM, SIM)
      setf (fluidProg, 'uDecay',         DECAY)
      set2f(fluidProg, 'uMouse',         mouse.x,     mouse.y)
      set2f(fluidProg, 'uPrevMouse',     prevMouse.x, prevMouse.y)
      setf (fluidProg, 'uRadius',        RADIUS)
      setf (fluidProg, 'uIntensity',     INTENSITY)
      setf (fluidProg, 'uMouseVelocity', smoothVelocity)

      gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[next].fbo)
      gl.viewport(0, 0, SIM, SIM)
      gl.drawArrays(gl.TRIANGLES, 0, 6)

      // ── 2. Display / mask pass ────────────────────────────
      gl.useProgram(displayProg)
      bindQuad(displayProg)
      setTex(displayProg, 'uDisp',   0, fbos[next].tex)
      setTex(displayProg, 'uReveal', 1, revealTex)
      set2f(displayProg, 'uResolution',      SIM, SIM)
      setf (displayProg, 'uDistortionStrength', DISTORTION)
      setf (displayProg, 'uRevealSize',      REVEAL_SIZE)
      setf (displayProg, 'uEdgeSoftness',    EDGE_SOFTNESS)
      setf (displayProg, 'uLightIntensity',  LIGHT)
      setf (displayProg, 'uSpecularPower',   SPEC_POWER)
      setf (displayProg, 'uCanvasAspect',    canvas.width / canvas.height)
      setf (displayProg, 'uImageAspect',     imageAspect)

      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLES, 0, 6)

      ping = next
      prevMouse.x = mouse.x
      prevMouse.y = mouse.y
    }

    loop()

    return () => {
      cancelAnimationFrame(frameId)
      ro.disconnect()
      hero.removeEventListener('mousemove', onMove)
      hero.removeEventListener('mouseleave', onLeave)
      hero.removeEventListener('touchmove', onTouch)
      hero.removeEventListener('touchend', onLeave)
      fbos.forEach(({ tex, fbo }) => { gl.deleteTexture(tex); gl.deleteFramebuffer(fbo) })
      gl.deleteTexture(revealTex)
      gl.deleteBuffer(quadBuf)
    }
  }, [])

  /* ── Cursor Image Trail ── */
  useEffect(() => {
    const hero = heroRef.current
    if (!hero) return

    // Replace these paths with your actual trail images
    const images = [
      '/images/trail1.jpg',
      '/images/trail2.jpg',
      '/images/trail3.jpg',
      '/images/trail4.jpg',
    ]
    const IMAGE_WIDTH  = 150
    const IMAGE_HEIGHT = 130
    const MIN_DISTANCE = 150

    let lastPosition = null
    let imageIndex   = 0

    const handleMouseMove = (e) => {
      const x = e.clientX
      const y = e.clientY

      if (
        lastPosition &&
        Math.sqrt((x - lastPosition.x) ** 2 + (y - lastPosition.y) ** 2) < MIN_DISTANCE
      ) return

      const direction = { x: 0, y: 0 }
      if (lastPosition) {
        direction.x = (x - lastPosition.x) > 0 ? 1 : -1
        direction.y = (y - lastPosition.y) > 0 ? 1 : -1
      }
      lastPosition = { x, y }

      const imageContainer = document.createElement('div')
      imageContainer.className = 'cursor-image'
      imageContainer.style.top    = `${y - IMAGE_HEIGHT / 2}px`
      imageContainer.style.left   = `${x - IMAGE_WIDTH  / 2}px`
      imageContainer.style.width  = `${IMAGE_WIDTH}px`
      imageContainer.style.height = `${IMAGE_HEIGHT}px`

      const img = document.createElement('img')
      img.src           = images[imageIndex]
      img.alt           = ''
      img.className     = 'cursor-image__img'
      imageIndex        = (imageIndex + 1) % images.length

      imageContainer.appendChild(img)
      document.body.appendChild(imageContainer)

      gsap.set(imageContainer, {
        scale: 0,
        x: -130 * direction.x,
        y: -70  * direction.y,
        opacity: 0,
      })

      gsap.timeline()
        .to(imageContainer, { opacity: 1, scale: 1, duration: 0.7, ease: 'power3.out' })
        .to(imageContainer, { x: 0, y: 0, duration: 0.6, ease: 'power3.out' }, '<')
        .to(imageContainer, {
          opacity: 0, scale: 0.3, duration: 0.4,
          onComplete: () => { document.body.removeChild(imageContainer) },
        }, '<+0.6')
    }

    hero.addEventListener('mousemove', handleMouseMove)
    return () => hero.removeEventListener('mousemove', handleMouseMove)
  }, [])

  /* ── Build RPM Bars ── */
  useEffect(() => {
  const container = rpmBarsRef.current
  if (!container) return
  const barHeights = [35,45,60,70,80,85,95,100,98,92,88,82,90,95,88,75,60,40]
  barHeights.forEach((h, i) => {
    const bar = document.createElement('div')
    bar.className = 'rpm-bar'
    const pct = i / barHeights.length
    const color = pct < 0.6
      ? `rgba(220,${Math.round(20 + pct * 30)},0,0.7)`
      : pct < 0.8 ? 'rgba(185, 7, 7, 0.9)' : 'rgba(50, 180, 11, 0.95)'
    bar.style.cssText = `height:${h}%;background:${color};animation:rpmAnim ${0.8 + Math.random() * 0.6}s ease-in-out infinite ${Math.random() * 0.5}s;transform-origin:bottom`
    container.appendChild(bar)
  })
}, [])

  /* ── Live Data Loop ── */
  useEffect(() => {
    const state = animStateRef.current
    const tick = () => {
      state.t += 0.02
      const t = state.t
      const spd = Math.round(220 + Math.sin(t * 0.7) * 40 + Math.sin(t * 2.1) * 15)
      const speedEl = document.getElementById('hud-speed-num')
      const ringEl = document.getElementById('hud-speed-ring')
      if (speedEl) speedEl.textContent = spd
      if (ringEl) ringEl.setAttribute('stroke-dashoffset', Math.round(226 - 226 * ((spd - 180) / 100) * 0.8))
      const rpm = Math.round(8000 + Math.sin(t * 1.1) * 3500)
      const rpmEl = document.getElementById('hud-rpm-val')
      if (rpmEl) rpmEl.textContent = rpm.toLocaleString() + ' RPM'
      const gears = [3,3,4,4,4,5,4,4,3,4]
      const gearEl = document.getElementById('hud-gear-num')
      if (gearEl) gearEl.textContent = gears[Math.floor(t * 0.8) % gears.length]
      const thr = Math.round(Math.max(0, Math.min(100, 65 + Math.sin(t * 1.3) * 30)))
      setBar('hud-throttle-fill', 'hud-throttle-val', thr, '%')
      const brk = Math.round(Math.max(0, Math.min(100, 5 + Math.cos(t * 1.3 + 1) * 30)))
      setBar('hud-brake-fill', 'hud-brake-val', brk, '%')
      const lean = Math.round(Math.abs(Math.sin(t * 0.5) * 52))
      setBar('hud-lean-fill', 'hud-lean-val', lean, '°')
      const trac = Math.round(75 + Math.sin(t * 2) * 15)
      setBar('hud-traction-fill', 'hud-traction-val', trac, '%')
      const gx = 40 + Math.sin(t * 0.8) * 18
      const gy = 40 + Math.cos(t * 0.6) * 14
      const dot = document.getElementById('hud-gforce-dot')
      const halo = document.getElementById('hud-gforce-halo')
      if (dot) { dot.setAttribute('cx', gx); dot.setAttribute('cy', gy) }
      if (halo) { halo.setAttribute('cx', gx); halo.setAttribute('cy', gy) }
      const gVal = (Math.sqrt((gx - 40) ** 2 + (gy - 40) ** 2) / 18 * 3).toFixed(1)
      const gfEl = document.getElementById('hud-gforce-val')
      if (gfEl) gfEl.textContent = gVal + ' G'
      state.animId = requestAnimationFrame(tick)
    }
    state.animId = requestAnimationFrame(tick)
    return () => { if (state.animId) cancelAnimationFrame(state.animId) }
  }, [])

  function setBar(fillId, valId, val, suffix) {
    const fill = document.getElementById(fillId)
    const label = document.getElementById(valId)
    if (fill) fill.style.width = val + '%'
    if (label) label.textContent = val + suffix
  }

  /* ── 3D magnetic tilt on widget hover ── */
  const handleMouseMove = (e) => {
    const el = e.currentTarget
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left - rect.width / 2
    const y = e.clientY - rect.top - rect.height / 2
    const rotX = -(y / rect.height) * 12
    const rotY = (x / rect.width) * 12
    el.style.transform = `perspective(400px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateZ(8px)`
  }
  const handleMouseLeave = (e) => { e.currentTarget.style.transform = '' }
  const tilt = { onMouseMove: handleMouseMove, onMouseLeave: handleMouseLeave }

  /* ── Section social spark burst (works for tyre-section icons) ── */
  const s2Spark = (e, color) => {
    const section = e.currentTarget.closest('.tyre-section')
    if (!section) return
    const pRect  = section.getBoundingClientRect()
    const cRect  = e.currentTarget.getBoundingClientRect()
    const cx = cRect.left + cRect.width  / 2 - pRect.left
    const cy = cRect.top  + cRect.height / 2 - pRect.top
    const palette = [color, '#ffffff', '#ffcc00', '#ff5500']
    for (let i = 0; i < 10; i++) {
      const p = document.createElement('div')
      p.className = 's2-spark'
      p.style.background = palette[Math.floor(Math.random() * palette.length)]
      p.style.left = `${cx + (Math.random() - 0.5) * 50}px`
      p.style.top  = `${cy}px`
      p.style.animationDelay    = `${(Math.random() * 0.25).toFixed(2)}s`
      p.style.animationDuration = `${(1.0 + Math.random() * 0.8).toFixed(2)}s`
      section.appendChild(p)
      setTimeout(() => p.remove(), 2200)
    }
  }

  /* ── Framer variants ── */
  const navbarVariant = {
    hidden: { y: -100, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { type: 'spring', stiffness: 80, damping: 14 } },
  }
  const widgetVariant = (delay = 0) => ({
    hidden: { opacity: 0, scale: 0.88, y: 20 },
    visible: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 80, damping: 14, delay } },
  })

  const tlData = [
    {
      year: '2017',
      route: 'Hyderabad to Goa ride',
      desc: 'First long-distance ride — 634 km solo on a stock bike. The ride that started everything.',
      tags: [{ label: '634 km', cls: 'red' }, { label: 'Solo', cls: '' }],
      active: false, delay: 0.15,
    },
    {
      year: '2018',
      route: 'Hyderabad to Pune ride',
      desc: 'Ride. Fuel. Repeat. — 560 km  one rider, endless memories..',
      tags: [{ label: '560 km', cls: 'red' }, { label: 'Solo', cls: '' }],
      active: false, delay: 0.15,
    },
    {
      year: '2020',
      route: 'India to China border ride',
      desc: '14 days, 3 mountain passes, altitude sickness and all. The ride that defined the channel.',
      tags: [{ label: '3,041 km', cls: 'gold' }, { label: '6,000m alt', cls: 'blue' }, { label: 'Arunachal Frontier highway', cls: '' }],
      active: false, delay: 0.25,
    },
    {
      year: '2022',
      route: 'Leh–Ladakh expedition ride',
      desc: 'Thousands of kilometers through mountain passes, frozen winds, and unforgettable roads.',
      tags: [{ label: '−15°C', cls: 'blue' }, { label: 'Extreme', cls: 'red' }],
      active: false, delay: 0.35,
    },
    {
      year: '2024',
      route: 'Spiti Valley adventure',
      desc: '−15°C temperatures, frozen roads, and zero phone signal. The most extreme ride yet.',
      tags: [{ label: '-15°C', cls: 'gold' }, { label: '2217 km', cls: 'red' }, { label: 'Frozen roads. Wild soul.', cls: 'red' }],
      active: true, delay: 0.45,
    },
  ]

  return (
    <>
      {/* ══════════════════════════
          SECTION 1 — HERO / HUD
      ══════════════════════════ */}
      <div className="hero" ref={heroRef}>
        <motion.div variants={navbarVariant} initial="hidden" animate="visible">
          <Navbar />
        </motion.div>

        {/* Speed */}
        <motion.div className="hud-widget w-speed" variants={widgetVariant(0.1)} initial="hidden" animate="visible" {...tilt}>
          <div className="speed-ring">
            <svg width="90" height="90" viewBox="0 0 90 90" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="45" cy="45" r="36" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="5"/>
              <circle cx="45" cy="45" r="36" fill="none" stroke="rgba(255,60,0,0.15)" strokeWidth="5" strokeDasharray="226" strokeDashoffset="226"/>
              <circle cx="45" cy="45" r="36" fill="none" stroke="#ff4500" strokeWidth="5" strokeDasharray="226" strokeDashoffset="82" strokeLinecap="round" id="hud-speed-ring"/>
            </svg>
            <div className="speed-val">
              <span className="speed-num" id="hud-speed-num">247</span>
              <span className="speed-unit">km/h</span>
            </div>
          </div>
          <span className="speed-label">top speed</span>
          <span className="speed-tag">▲ +12%</span>
        </motion.div>

        {/* Lap Timer */}
        <motion.div className="hud-widget w-lap" variants={widgetVariant(0.2)} initial="hidden" animate="visible" {...tilt}>
          <div className="lap-header">
            <span className="lap-title">lap time</span>
            <div className="lap-dot"></div>
          </div>
          <div className="lap-time">1:42.3</div>
          <div className="lap-sub">BEST: 1:39.8 · LAP 7</div>
        </motion.div>

        {/* RPM */}
        <motion.div className="hud-widget w-rpm" variants={widgetVariant(0.3)} initial="hidden" animate="visible" {...tilt}>
          <div className="rpm-header">
            <span className="rpm-title">engine rpm</span>
            <span className="rpm-val" id="hud-rpm-val">11,200 RPM</span>
          </div>
          <div className="rpm-bars" ref={rpmBarsRef}></div>
        </motion.div>

        {/* Gear */}
        <motion.div className="hud-widget w-gear" variants={widgetVariant(0.15)} initial="hidden" animate="visible" {...tilt}>
          <span className="gear-num" id="hud-gear-num">4</span>
          <span className="gear-label">gear</span>
        </motion.div>

        {/* G-Force */}
        <motion.div className="hud-widget w-gforce" variants={widgetVariant(0.25)} initial="hidden" animate="visible" {...tilt}>
          <span className="gforce-title">g-force</span>
          <div className="gforce-meter">
            <svg width="80" height="80" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="35" fill="none" stroke="rgba(0,212,255,0.1)" strokeWidth="1"/>
              <circle cx="40" cy="40" r="22" fill="none" stroke="rgba(0,212,255,0.07)" strokeWidth="1"/>
              <circle cx="40" cy="40" r="10" fill="none" stroke="rgba(0,212,255,0.15)" strokeWidth="1"/>
              <line x1="5" y1="40" x2="75" y2="40" stroke="rgba(0,212,255,0.08)" strokeWidth="0.5"/>
              <line x1="40" y1="5" x2="40" y2="75" stroke="rgba(0,212,255,0.08)" strokeWidth="0.5"/>
              <circle cx="52" cy="32" r="8" fill="rgba(0,212,255,0.15)" id="hud-gforce-halo"/>
              <circle cx="52" cy="32" r="4" fill="#00d4ff" opacity="0.9" id="hud-gforce-dot"/>
            </svg>
          </div>
          <span className="gforce-val" id="hud-gforce-val">2.4 G</span>
        </motion.div>

        {/* Socials */}
        {/* <motion.div className="hud-widget w-social w-youtube" variants={widgetVariant(0.45)} initial="hidden" animate="visible" {...tilt}>
          <div className="social-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="red">
              <path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/>
            </svg>
          </div>
          <span className="social-name">Sriman Kotaru</span>
          <div className="social-glow yt-glow" />
        </motion.div> */}

        {/* <motion.div className="hud-widget w-social w-instagram" variants={widgetVariant(0.5)} initial="hidden" animate="visible" {...tilt}>
          <div className="social-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24">
              <defs>
                <linearGradient id="ig-grad" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#f09433"/>
                  <stop offset="25%" stopColor="#e6683c"/>
                  <stop offset="50%" stopColor="#dc2743"/>
                  <stop offset="75%" stopColor="#cc2366"/>
                  <stop offset="100%" stopColor="#bc1888"/>
                </linearGradient>
              </defs>
              <path fill="url(#ig-grad)" d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/>
            </svg>
          </div>
          <span className="social-name">srimankotaru</span>
          <div className="social-glow ig-glow" />
        </motion.div>

        <motion.div className="hud-widget w-social w-twitter" variants={widgetVariant(0.55)} initial="hidden" animate="visible" {...tilt}>
          <div className="social-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="white">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.26 5.632zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
          </div>
          <span className="social-name">@srimankotaru</span>
          <div className="social-glow x-glow" />
        </motion.div>

        <motion.div className="hud-widget w-social w-facebook" variants={widgetVariant(0.6)} initial="hidden" animate="visible" {...tilt}>
          <div className="social-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="#1877F2">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
          </div>
          <span className="social-name">Sriman Kotaru</span>
          <div className="social-glow fb-glow" />
        </motion.div> */}

        {/* Inputs */}
        <motion.div className="hud-widget w-inputs" variants={widgetVariant(0.55)} initial="hidden" animate="visible" {...tilt}>
          {[
            { label: 'throttle', fillId: 'hud-throttle-fill', valId: 'hud-throttle-val', defaultW: '72%', color: 'linear-gradient(to right,#FF0000)', defaultVal: '72%' },
            { label: 'brake',    fillId: 'hud-brake-fill',    valId: 'hud-brake-val',    defaultW: '0%',  color: 'linear-gradient(to right,#00aaff,#0066cc)', defaultVal: '0%'  },
            { label: 'lean',     fillId: 'hud-lean-fill',     valId: 'hud-lean-val',     defaultW: '38%', color: 'linear-gradient(to right,#ffaa00,#ff7700)', defaultVal: '38°' },
            { label: 'traction', fillId: 'hud-traction-fill', valId: 'hud-traction-val', defaultW: '85%', color: 'linear-gradient(to right,#00ff88,#00cc66)', defaultVal: '85%' },
          ].map(({ label, fillId, valId, defaultW, color, defaultVal }) => (
            <div className="input-item" key={label}>
              <span className="input-label">{label}</span>
              <div className="input-bar">
                <div className="input-fill" id={fillId} style={{ width: defaultW, background: color }}></div>
              </div>
              <span className="input-val" id={valId}>{defaultVal}</span>
            </div>
          ))}
        </motion.div>

        {/* ── WebGL Fluid Mask Reveal Canvas ── */}
        <canvas ref={maskRevealRef} className="mask-reveal-layer" />

        <div className="hero-content">
          <div className="left"></div>
          <div className="right"></div>
        </div>
      </div>

      {/* ══════════════════════════════════════════
          SECTION 1.5 — TYRE TRACK BANNER
          Social icons float directly on the bg.
          All sizing → Hero.css  "TYRE SECTION SOCIALS"
      ══════════════════════════════════════════ */}
      <section className="tyre-section">
        <div className="tyre-overlay" />

        <div className="ts-social">
          <p className="ts-follow-label">Follow the Rider</p>
          <h2 className="ts-creator-name">Sriman Kotaru</h2>

          <div className="ts-divider">
            <span className="ts-divider-line" />
            <span className="ts-divider-diamond" />
            <span className="ts-divider-line" />
          </div>

          <div className="ts-icons-row">

            <div className="ts-icon-card" onClick={(e) => s2Spark(e,'#FF0000')} title="YouTube">
              <div className="ts-icon-bg ts-yt">
                <span className="ts-corner ts-corner--tl" />
                <span className="ts-corner ts-corner--br" />
                <svg className="ts-icon-svg" viewBox="0 0 24 24">
                  <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31.2 31.2 0 0 0 0 12a31.2 31.2 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31.2 31.2 0 0 0 24 12a31.2 31.2 0 0 0-.5-5.8zM9.8 15.6V8.4L15.8 12l-6 3.6z"/>
                </svg>
              </div>
              <div className="ts-icon-label">YouTube</div>
              <div className="ts-icon-handle">SrimanKotaru</div>
            </div>

            <div className="ts-icon-card" onClick={(e) => s2Spark(e,'#E1306C')} title="Instagram">
              <div className="ts-icon-bg ts-ig">
                <span className="ts-corner ts-corner--tl" />
                <span className="ts-corner ts-corner--br" />
                <svg className="ts-icon-svg" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/>
                </svg>
              </div>
              <div className="ts-icon-label">Instagram</div>
              <div className="ts-icon-handle">@srimankotaru</div>
            </div>

            <div className="ts-icon-card" onClick={(e) => s2Spark(e,'#ffffff')} title="X / Twitter">
              <div className="ts-icon-bg ts-x">
                <span className="ts-corner ts-corner--tl" />
                <span className="ts-corner ts-corner--br" />
                <svg className="ts-icon-svg" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.26 5.632zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </div>
              <div className="ts-icon-label">X / Twitter</div>
              <div className="ts-icon-handle">@srimankotaru</div>
            </div>

            <div className="ts-icon-card" onClick={(e) => s2Spark(e,'#1877F2')} title="Facebook">
              <div className="ts-icon-bg ts-fb">
                <span className="ts-corner ts-corner--tl" />
                <span className="ts-corner ts-corner--br" />
                <svg className="ts-icon-svg" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              </div>
              <div className="ts-icon-label">Facebook</div>
              <div className="ts-icon-handle">@srimankotaru</div>
            </div>

            <div className="ts-icon-card" onClick={(e) => s2Spark(e,'#000000')} title="Threads">
              <div className="ts-icon-bg ts-threads">
                <span className="ts-corner ts-corner--tl" />
                <span className="ts-corner ts-corner--br" />
                <svg className="ts-icon-svg" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.29a13.495 13.495 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.583-1.317-.88-2.39-.887h-.048c-.832 0-1.888.202-2.59 1.171l-1.6-1.283c.926-1.292 2.385-2.004 4.185-2.016h.062c1.615.012 2.949.524 3.862 1.48 1.038 1.087 1.532 2.68 1.47 4.736.678.45 1.27 1.01 1.753 1.65 1.027 1.401 1.233 3.468.492 5.467-.81 2.162-2.59 3.647-5.034 4.193-.698.157-1.427.24-2.188.247zm-1.08-10.697c-.786.045-1.428.28-1.845.673-.337.31-.51.71-.483 1.12.058 1.047 1.214 1.56 2.334 1.498 1.168-.063 2.026-.464 2.553-1.19.44-.594.682-1.44.72-2.518a11.403 11.403 0 0 0-2.735-.155l-.544.572z"/>
                </svg>
              </div>
              <div className="ts-icon-label">Threads</div>
              <div className="ts-icon-handle">@srimankotaru</div>
            </div>
          </div>

          <div className="ts-divider">
            <span className="ts-divider-line" />
            <span className="ts-divider-diamond" />
            <span className="ts-divider-line" />
          </div>

          <p className="ts-tagline">Moto Creator</p>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          SECTION 2 — VIDEO BACKGROUND + TIMELINE
      ══════════════════════════════════════════ */}
        <section className="vs-section">
 
      {/* Video */}
      <video
        className="vs-video"
        src="/images/bike-video.mp4"
        autoPlay
        muted
        loop
        playsInline
      />
 
      {/* Overlay */}
      <div className="vs-overlay" />
 
      {/* Content */}
      <div className="vs-content">
        <div className="tl-wrapper">
 
          {/* LEFT — timeline */}
          <div className="tl-left">
 
            <motion.div
              className="tl-header"
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ type: 'spring', stiffness: 70, damping: 16, delay: 0.05 }}
            >
              <span className="tl-badge">Journey Timeline</span>
              <h2 className="tl-heading">The Road<span> So Far</span></h2>
              <p className="tl-subheading">Eight years. 14,974 kilometres. Every part of India — on two wheels.</p>
            </motion.div>
 
            <div className="tl-track">
              <div className="tl-spine" />
              {tlData.map(({ year, route, desc, tags, active, delay }) => (
                <motion.div
                  className={`tl-item${active ? ' tl-item--active' : ''}`}
                  key={year}
                  initial={{ opacity: 0, x: -28 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ type: 'spring', stiffness: 70, damping: 16, delay }}
                >
                  <div className="tl-year-col">
                    <span className="tl-year">{year}</span>
                  </div>
                  <div className="tl-dot-col">
                    <div className={`tl-dot${active ? ' tl-dot--active' : ''}`} />
                  </div>
                  <div className="tl-body">
                    <div className="tl-route">{route}</div>
                    <div className="tl-desc">{desc}</div>
                    <div className="tl-tags">
                      {tags.map(({ label, cls }) => (
                        <span key={label} className={`tl-tag${cls ? ` tl-tag--${cls}` : ''}`}>{label}</span>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
 
          </div>{/* end tl-left */}
 
          {/* RIGHT — episode card top + stats pinned to bottom */}
          <div className="tl-right">

            {/* ── Latest Episode Card ── */}
            <motion.div
              className="ep-card"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ type: 'spring', stiffness: 70, damping: 16, delay: 0.35 }}
            >
              {/* YouTube embed — plays continuously, muted by default */}
              <div className="ep-thumb">
                <iframe
                  ref={epIframeRef}
                  className="ep-iframe"
                  src={`https://www.youtube.com/embed/${YT_VIDEO_ID}?autoplay=1&mute=1&loop=1&playlist=${YT_VIDEO_ID}&controls=0&showinfo=0&rel=0&modestbranding=1&playsinline=1&enablejsapi=1`}
                  title="Latest episode"
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                />
                {/* Mute / unmute toggle */}
                <button
                  className={`ep-mute-btn${epMuted ? '' : ' ep-mute-btn--on'}`}
                  onClick={() => setEpMuted(m => !m)}
                  aria-label={epMuted ? 'Unmute video' : 'Mute video'}
                >
                  {epMuted ? (
                    /* muted icon */
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="white">
                      <path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06A8.99 8.99 0 0 0 17.73 18l1.98 2 1.27-1.27L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                    </svg>
                  ) : (
                    /* unmuted icon */
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="white">
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77 0-4.28-2.99-7.86-7-8.77z"/>
                    </svg>
                  )}
                </button>
                <div className="ep-views">80 k views</div>
                <div className="ep-duration">24:17</div>
                {/* Red bottom accent line */}
                <div className="ep-accent-line" />
              </div>

              {/* Body */}
              <div className="ep-body">
                <div className="ep-num">Episode 47 · Latest</div>
                <div className="ep-title">Spiti Valley in winter — frozen roads, zero signal, pure bliss</div>
                <div className="ep-meta">
                  <span className="ep-meta-item">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    May 2026
                  </span>
                  <span className="ep-meta-item">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 1 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    SPITI - Rakchham
                  </span>
                  <span className="ep-meta-item ep-meta-likes">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                    3.2 k
                  </span>
                </div>
              </div>
            </motion.div>

            {/* ── Stats bar pinned to bottom ── */}
            <motion.div
              className="tl-stats"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ type: 'spring', stiffness: 70, damping: 16, delay: 0.55 }}
            >
              {[
                { num: '15K',  lbl: 'total km' },
                { num: '8',    lbl: 'years riding' },
                { num: '1.3K', lbl: 'Videos' },
                { num: '525K', lbl: 'subscribers' },
              ].map(({ num, lbl }) => (
                <div className="tl-stat" key={lbl}>
                  <span className="tl-stat-num">{num}</span>
                  <span className="tl-stat-lbl">{lbl}</span>
                </div>
              ))}
            </motion.div>
          </div>{/* end tl-right */}
 
        </div>
      </div>
 
    </section>
    </>
  )
}

export default Hero