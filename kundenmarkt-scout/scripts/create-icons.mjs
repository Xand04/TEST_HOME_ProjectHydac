import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="108" fill="#102e4a"/><circle cx="256" cy="256" r="146" fill="none" stroke="#fff" stroke-width="16"/><circle cx="256" cy="256" r="88" fill="none" stroke="#7799b3" stroke-width="11"/><path d="M256 110V256L359 153" fill="none" stroke="#fff" stroke-width="16" stroke-linejoin="round"/><circle cx="210" cy="293" r="20" fill="#fff"/><circle cx="358" cy="358" r="40" fill="#d22735"/><path d="m341 358 12 12 23-25" stroke="#fff" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
await mkdir("public/icons", { recursive: true });
for (const [name, size] of [["icon-192.png",192], ["icon-512.png",512], ["apple-touch-icon.png",180]]) await sharp(Buffer.from(svg)).resize(size,size).png().toFile(`public/icons/${name}`);
await writeFile("public/favicon.svg", svg);
