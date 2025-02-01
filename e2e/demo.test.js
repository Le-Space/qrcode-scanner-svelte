import { expect, test } from '@playwright/test';
import { CryptoPSBT } from '@keystonehq/bc-ur-registry';
import * as bitcoin from 'bitcoinjs-lib';

test('scanner component shows results after successful scan', async ({ page }) => {
    // Navigate to the page
    await page.goto('/');
    
    // Verify scanner is visible
    const scanner = page.locator('.scanner');
    await expect(scanner).toBeVisible();
    
    // Mock successful QR code scan by accessing the component's context
    await page.evaluate(() => {
        // Find the Scanner component instance
        const scannerComponent = document.querySelector('.scanner')?.__svelte_component__;
        if (scannerComponent) {
            // Set both result and isScanning to trigger the correct state
            scannerComponent.$set({ 
                result: 'test123',
                isScanning: false 
            });
        }
    });

    // Wait for the scanner--hidden class to be added
    // await expect(scanner).toHaveClass(/scanner--hidden/, { timeout: 5000 });
    
    // Check if results are displayed
    const results = page.locator('[data-testid="results"]');
    await expect(results).toBeVisible();
    console.log(await results.textContent());
    // Verify the scanned content is displayed
    // await expect(page.getByText('test123')).toBeVisible();
    
    // Test new scan button
    const newScanButton = page.getByRole('button', { name: /scan again/i });
    await newScanButton.click();
    
    // Verify scanner is visible again
    await expect(scanner).not.toHaveClass(/scanner--hidden/);
});

test.only('scanner component can read a QR code from camera', async ({ page }) => {
    await page.goto('/');
    
    // Create a mock camera stream
    await page.evaluate(async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d');
        
        // Simulate camera movement by adding some noise/movement to the frame
        function addCameraMovement(ctx, timestamp) {
            // Add a slight movement effect
            ctx.save();
            ctx.translate(
                Math.sin(timestamp / 1000) * 5, 
                Math.cos(timestamp / 1000) * 5
            );
        }
        
        // Load the QR code image
        const img = new Image();
        img.src = '/bcur-example.png';
        
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
        });

        // Create an animation loop to simulate camera feed
        let animationFrame;
        function updateCanvas(timestamp) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Add camera-like movement
            addCameraMovement(ctx, timestamp);
            
            // Draw "camera feed" background
            ctx.fillStyle = '#333';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Center and draw the QR code with a larger size
            const scale = 2; // Make QR code larger
            const scaledWidth = img.width * scale;
            const scaledHeight = img.height * scale;
            const x = (canvas.width - scaledWidth) / 2;
            const y = (canvas.height - scaledHeight) / 2;
            ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
            
            ctx.restore();
            
            // Continue animation loop
            animationFrame = requestAnimationFrame(updateCanvas);
        }
        
        // Start the animation
        animationFrame = requestAnimationFrame(updateCanvas);
        
        // Create stream from the animated canvas
        const stream = canvas.captureStream(30); // Specify 30fps for smoother video
        
        // Mock the camera API
        const originalGetUserMedia = navigator.mediaDevices.getUserMedia;
        navigator.mediaDevices.getUserMedia = async () => stream;
        
        // Cleanup function
        return () => {
            cancelAnimationFrame(animationFrame);
            navigator.mediaDevices.getUserMedia = originalGetUserMedia;
        };
    });

    // Wait for scanner to process the QR code
    const results = page.locator('[data-testid="results"]');
    await expect(results).toBeVisible({ timeout: 10000 });
	console.log(await results.textContent());
    //can we wait a little so i can watch the animation?
    await new Promise(resolve => setTimeout(resolve, 15000));
    // Log the scanned result
  
});

test('scanner component can read a PSBT QR code', async ({ page }) => {
    await page.goto('/');
    
    // Create a more complex PSBT with multiple inputs and outputs
    const psbt = new bitcoin.Psbt();
    
    // Add multiple inputs
    for (let i = 0; i < 3; i++) {
        psbt.addInput({
            hash: 'b226be07693347bc5e237ecbf60b8af52b758bd0125890e3f17ac9e5b45b1ba5',
            index: i,
            sequence: 0xffffffff,
        });
    }

    // Add multiple outputs
    psbt.addOutput({
        address: 'bc1qtykrk5lrpdxr0ucppyumtg96wcgqqj34hetnk9',
        value: 200000,
    });
    psbt.addOutput({
        address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
        value: 150000,
    });
    psbt.addOutput({
        address: 'bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3',
        value: 153851,
    });

    // Convert PSBT to UR parts
    const qrDataHex = psbt.toHex();
    const data = Buffer.from(qrDataHex, 'hex');
    const cryptoPSBT = new CryptoPSBT(data);
    const maxFragmentLength = 200;
    const encoder = cryptoPSBT.toUREncoder(maxFragmentLength);

    // Collect all parts
    const urParts = [];
    for (let c = 1; c <= encoder.fragmentsLength; c++) {
        const ur = encoder.nextPart();
        urParts.push(ur);
    }
    console.log('UR parts to be encoded in QR:', urParts);

    // Create a mock camera stream with the QR code
    await page.evaluate(async (qrData) => {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d');

        // Dynamically import VK QR and get the default export
        const { default: vkQr } = await import('https://esm.sh/@vkontakte/vk-qr');
        console.log('Creating QR codes for parts:', qrData);
        
        const qrSvgs = qrData.map((part, index) => {
            const qrSvg = vkQr.createQR(part, {
                qrSize: 256,
                isShowLogo: false,
                foregroundColor: '#000000',
                backgroundColor: '#FFFFFF'
            });
            console.log(`Created SVG ${index}:`, qrSvg.substring(0, 100) + '...');
            return qrSvg;
        });
        
        // Create array of images from SVGs
        const images = await Promise.all(qrSvgs.map(async (svg, index) => {
            const img = new Image();
            const svgBlob = new Blob([svg], { type: 'image/svg+xml' });
            const svgUrl = URL.createObjectURL(svgBlob);
            
            try {
                await new Promise((resolve, reject) => {
                    img.onload = () => {
                        console.log(`Image ${index} loaded:`, {
                            width: img.width,
                            height: img.height,
                            naturalWidth: img.naturalWidth,
                            naturalHeight: img.naturalHeight
                        });
                        resolve();
                    };
                    img.onerror = (e) => {
                        console.error(`Failed to load image ${index}:`, e);
                        reject(new Error(`Failed to load image ${index}: ${e}`));
                    };
                    img.src = svgUrl;
                });
            } catch (error) {
                console.error(`Error loading image ${index}:`, error);
            } finally {
                URL.revokeObjectURL(svgUrl);
            }
            return img;
        }));

        let currentIndex = 0;
        console.log('Starting animation with images:', images.map(img => ({
            width: img.width,
            height: img.height,
            complete: img.complete
        })));
        
        // Set up interval to cycle through QR codes
        const qrInterval = setInterval(() => {
            currentIndex = (currentIndex + 1) % images.length;
        }, 500);

        // Animation loop
        let animationFrame;
        function updateCanvas(timestamp) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Draw "camera feed" background
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Draw current QR code
            const currentImage = images[currentIndex];
            const scale = 2; // Make QR code larger
            const scaledWidth = 256 * scale;
            const scaledHeight = 256 * scale;
            const x = (canvas.width - scaledWidth) / 2;
            const y = (canvas.height - scaledHeight) / 2;
            
            // Add white background behind QR code
            ctx.fillStyle = '#fff';
            ctx.fillRect(x, y, scaledWidth, scaledHeight);
            
            // Draw QR code
            ctx.drawImage(currentImage, x, y, scaledWidth, scaledHeight);
            
            animationFrame = requestAnimationFrame(updateCanvas);
        }
        
        animationFrame = requestAnimationFrame(updateCanvas);
        
        // Create stream
        const stream = canvas.captureStream(30);
        
        // Mock camera API
        const originalGetUserMedia = navigator.mediaDevices.getUserMedia;
        navigator.mediaDevices.getUserMedia = async () => stream;
        
        return () => {
            cancelAnimationFrame(animationFrame);
            clearInterval(qrInterval);  // Clean up interval
            navigator.mediaDevices.getUserMedia = originalGetUserMedia;
        };
    }, urParts);  // urParts is passed here as the second argument to page.evaluate()

    // Wait for scanner to process
    const results = page.locator('[data-testid="results"]');
    await expect(results).toBeVisible({ timeout: 20000 });
    
    // Watch animation
    await new Promise(resolve => setTimeout(resolve, 15000));
    
    // Log result
    const resultText = await results.textContent();
    console.log('Scanned result:', resultText);
    
    // Verify it's a valid PSBT
    expect(resultText).toContain('cHNid'); // Base64 PSBT always starts with 'psbt' encoded
});
