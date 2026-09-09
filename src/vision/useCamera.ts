import { useCallback, useEffect, useRef, useState } from 'react'
import { DETECT } from '@/config/kiosk'

/**
 * Camera failures an unattended kiosk actually hits. Each maps to its own
 * on-screen panel, because the remedy differs: a denied permission needs
 * staff, a busy device needs the other app closed, an insecure origin is a
 * deployment mistake.
 */
export type CameraFault =
  | 'denied' // NotAllowedError — permission refused or blocked by policy
  | 'not-found' // NotFoundError / OverconstrainedError — no usable device
  | 'busy' // NotReadableError — device held by another process
  | 'insecure' // not https/localhost, so getUserMedia does not exist
  | 'unknown'

export type CameraState =
  | { status: 'idle' }
  | { status: 'starting' }
  | { status: 'live'; stream: MediaStream }
  | { status: 'error'; fault: CameraFault; detail: string }

function classify(err: unknown): { fault: CameraFault; detail: string } {
  if (!(err instanceof DOMException)) {
    return { fault: 'unknown', detail: err instanceof Error ? err.message : String(err) }
  }
  switch (err.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return { fault: 'denied', detail: err.message }
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return { fault: 'not-found', detail: err.message }
    case 'NotReadableError':
    case 'TrackStartError':
      return { fault: 'busy', detail: err.message }
    case 'SecurityError':
      return { fault: 'insecure', detail: err.message }
    default:
      return { fault: 'unknown', detail: `${err.name}: ${err.message}` }
  }
}

export function useCamera(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const [state, setState] = useState<CameraState>({ status: 'idle' })
  const streamRef = useRef<MediaStream | null>(null)

  const stop = useCallback(() => {
    // Tracks must be stopped explicitly or the camera light stays on between
    // attendees — which reads as "still recording" even though it isn't.
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setState({ status: 'idle' })
  }, [videoRef])

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState({
        status: 'error',
        fault: 'insecure',
        detail: 'getUserMedia unavailable — needs https or localhost',
      })
      return
    }

    setState({ status: 'starting' })
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false, // Never. There is no reason for a check-in kiosk to hear.
        video: {
          facingMode: 'user',
          width: { ideal: DETECT.video.width },
          height: { ideal: DETECT.video.height },
          frameRate: { ideal: 30 },
        },
      })

      streamRef.current = stream
      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        // iOS/Safari refuse to autoplay without both of these set on the element.
        video.muted = true
        video.playsInline = true
        await video.play().catch(() => {})
      }
      setState({ status: 'live', stream })
    } catch (err) {
      const { fault, detail } = classify(err)
      setState({ status: 'error', fault, detail })
    }
  }, [videoRef])

  // Release the device if the component goes away mid-session.
  useEffect(() => stop, [stop])

  return { state, start, stop }
}
