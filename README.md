# PWA QR Code Scanner with BC-UR support

QR Code scanner in a Svelte Component with [BC-UR Encoding](https://github.com/ngraveio/bc-ur) support. It is also known as "animated" QR-Codes. 

BC-UR not to confuse with [BBQR - Better Bitcoin QR](https://bbqr.org/), which isn't supported yet. Both standards are supported by major Bitcoin wallets such as Electrum, BlueWallet, Sparrow Wallet and numerous other hardware wallets.

## Use

[Demo](https://peerpiper.github.io/qrcode-scanner-svelte)

Basic

```js
<Scanner />
```

Custom

```js

    let result

    <Scanner bind:result>
        <!-- Insert custom results component if you want to do something unique with the QR code data -->
		<!-- override default by placing handler in here  -->
		{#if result}
			<div>
				The result is: {result}
			</div>
			<div>
				<button on:click={() => (result = null)}>Scan again</button>
			</div>
		{/if}
	</Scanner>
```
