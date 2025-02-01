<script lang="ts">
	import { onMount, createEventDispatcher } from 'svelte';
	import { stream, error, status } from '../stores.js';
	import { CryptoPSBT } from '@keystonehq/bc-ur-registry';
	import { URDecoder } from '@ngraveio/bc-ur';

	import jsQR from 'jsqr';

	import ScannerBorders from './ScannerBorders.svelte';
	import Results from './Results.svelte';

	import UserMedia from '../utils/use-usermedia.svelte';

	export let result = null; // : string
	export let stopMediaStream = null;
	let startMediaStream;

	// New state for BC-UR handling
	let urDecoder = new URDecoder();
	let scanProgress = 0;
	let isScanning = true;

	const dispatch = createEventDispatcher();

	$: active = isScanning;

	let video: HTMLVideoElement = null;
	let canvas: HTMLCanvasElement = null;
	let useUserMedia;
	let mounted;

	onMount(() => {
		mounted = true;

		({ stopMediaStream, startMediaStream } = useUserMedia());

		return () => {
			console.log('Component destroyed');
			stopMediaStream();
			video.srcObject = null;
		};
	});

	const processQRResult = (qrData: string): void => {
		if (qrData.toLowerCase().startsWith('ur:')) {
			try {
				// Handle BC-UR code
				urDecoder.receivePart(qrData);
				scanProgress = urDecoder.getProgress() * 100;

				if (urDecoder.isComplete()) {
					if (urDecoder.isSuccess()) {
						const decoded = urDecoder.resultUR();
						let processedResult;

						if (decoded.type === 'crypto-psbt') {
							try {
								const psbt = CryptoPSBT.fromCBOR(decoded.cbor);
								const psbtBuffer = Buffer.from(psbt.getPSBT());
								processedResult = psbtBuffer.toString('base64');
								console.log('Successfully decoded PSBT:', processedResult);
							} catch (psbtError) {
								console.error('Error processing PSBT:', psbtError);
								processedResult = decoded;
							}
						} else {
							processedResult = decoded;
						}

						result = processedResult;
						isScanning = false;
						dispatch('successfulScan', processedResult);
						stopMediaStream();
						video.srcObject = null;
					} else {
						console.error('UR decode complete but unsuccessful');
						// Reset decoder and start over
						urDecoder = new URDecoder();
						scanProgress = 0;
						setTimeout(startCapturing, 100);
					}
				} else {
					// Continue scanning for more parts
					setTimeout(startCapturing, 100);
				}
			} catch (urError) {
				console.error('Error processing UR code:', urError);
				// Reset decoder and start over
				urDecoder = new URDecoder();
				scanProgress = 0;
				setTimeout(startCapturing, 100);
			}
		} else {
			// Handle regular QR code
			result = qrData;
			isScanning = false;
			dispatch('successfulScan', qrData);
			stopMediaStream();
			video.srcObject = null;
		}
	};

	const startCapturing = (): void => {
		if (!canvas || !video) return;

		const context = canvas.getContext('2d');

		if (!context) return;

		const { width, height } = canvas;

		context.drawImage(video, 0, 0, width, height);

		const imageData = context.getImageData(0, 0, width, height);
		const qrCode = jsQR(imageData.data, width, height);

		if (qrCode === null) {
			setTimeout(startCapturing, 750);
		} else {
			processQRResult(qrCode.data);
		}
	};

	const handleCanPlay = (): void => {
		console.log('canplay');
		if (canvas === null || canvas === null || video === null || video === null) {
			return;
		}

		canvas.width = video.videoWidth;
		canvas.height = video.videoHeight;

		if ($error !== null) {
			// TODO: show dialog to user with an error
		} else {
			startCapturing();
		}
	};

	$: if ($status === 'resolved' && video !== null && $stream) {
		console.log('Resolve, stream');
		video.srcObject = $stream;
		video.play().catch(console.error);
	}

	$: if (active && $status === 'stopped' && startMediaStream) {
		startMediaStream();
	}
</script>

<UserMedia bind:useUserMedia />

<div class={`scanner ${active ? '' : 'scanner--hidden'}`}>
	<div class="scanner__aspect-ratio-container">
		<canvas bind:this={canvas} class="scanner__canvas" id="canvas" ></canvas>
		<!-- svelte-ignore a11y-media-has-caption -->
		<video bind:this={video} on:canplay={handleCanPlay} class="scanner__video">
			<!-- <track kind="captions" /> -->
		</video>
		<ScannerBorders />
		
		{#if scanProgress > 0 && scanProgress < 100}
		<div class="scanner__progress">
			<div class="scanner__progress-text">Scanning: {Math.round(scanProgress)}%</div>
			<div class="scanner__progress-bar">
				<div class="scanner__progress-fill" style="width: {scanProgress}%"></div>
			</div>
		</div>
		{/if}
	</div>

	<div class="scanner-tip">
		<div>Scan a QR code with your camera to see what it says.</div>
	</div>
</div>

<slot {result}>
	<Results 
		active={result !== null} 
		decodedData={result} 
		onNewScan={() => {
			result = null;
			isScanning = true;
			urDecoder = new URDecoder();
			scanProgress = 0;
			if (startMediaStream) startMediaStream();
		}} 
	/>
</slot>

<style>
	.scanner {
		width: 100%;
		max-width: 500px;
	}

	.scanner--hidden {
		display: none;
	}

	.scanner__aspect-ratio-container {
		position: relative;

		overflow: hidden;

		padding-bottom: 100%;

		border-radius: 10%;
	}

	.scanner__video {
		position: absolute;
		top: 0;
		left: 0;

		width: 100%;
		height: 100%;

		border-radius: inherit;

		outline: none;
		object-fit: cover;
	}

	.scanner__canvas {
		display: none;
	}

	.scanner-tip {
		display: flex;
		justify-content: center;

		margin-top: 15px;

		font-size: 0.8rem;
	}

	.scanner__progress {
		position: absolute;
		bottom: 20px;
		left: 50%;
		transform: translateX(-50%);
		width: 80%;
		background: rgba(0, 0, 0, 0.7);
		padding: 10px;
		border-radius: 8px;
	}

	.scanner__progress-text {
		color: white;
		text-align: center;
		margin-bottom: 5px;
		font-size: 14px;
	}

	.scanner__progress-bar {
		width: 100%;
		height: 4px;
		background: rgba(255, 255, 255, 0.3);
		border-radius: 2px;
	}

	.scanner__progress-fill {
		height: 100%;
		background: #4CAF50;
		border-radius: 2px;
		transition: width 0.3s ease;
	}
</style>
