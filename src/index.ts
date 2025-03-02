import fs from "fs";
import { parse as parseNBT } from "prismarine-nbt";
import * as THREE from "three";
import { program } from "commander";
import path from "path";
import { GLTFExporter, TextureLoader } from "node-three-gltf";
import { cwd } from "process";
import { Canvas, createCanvas, loadImage } from "canvas";

// Ensure temp directory exists
const tempDir = path.join(process.cwd(), "temp");
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

program
    .version("1.0.0")
    .description("Convert .mcstructure files to .glb for Blender")
    .argument("<input>", "Input .mcstructure file")
    .argument("<output>", "Output .glb file")
    .action(async (input, output) => {
        try {
            console.log(`---- [📌] Program Logs Start Here ----\n`);

            console.log(`[🟡] 📂 Reading file: ${input}\n`);
            const buffer = fs.readFileSync(input);
            const { parsed } = await parseNBT(buffer);
            const root = parsed.value;
            const structure = root.structure?.value;

            if (!structure)
                throw new Error("Invalid .mcstructure file format.");

            const outputDir = path.dirname(output);
            if (!fs.existsSync(outputDir))
                fs.mkdirSync(outputDir, { recursive: true });

            // Extract size
            // @ts-ignore
            const size = root.size?.value?.value;
            if (
                !Array.isArray(size) ||
                size.length !== 3 ||
                size.some((v) => typeof v !== "number")
            ) {
                throw new Error(
                    `[❌] Invalid size data: ${JSON.stringify(size)}`
                );
            }

            const [width, height, depth] = size;
            console.log(
                `[🔍] Structure size: ${width} x ${height} x ${depth}\n`
            );

            // Extract block indices
            let blockIndices =
                // @ts-ignore
                structure.block_indices?.value?.value?.[0]?.value;
            if (!Array.isArray(blockIndices))
                throw new Error("[❌] Missing or malformed block_indices.");

            // Extract block palette
            let palette =
                // @ts-ignore
                structure.palette?.value?.default?.value?.block_palette?.value;
            if (!Array.isArray(palette) && palette?.value)
                palette = palette.value;
            if (!Array.isArray(palette))
                throw new Error("[❌] Invalid or missing block_palette.");

            console.log(
                `[🔍] Extracted palette list: ${palette.length} blocks\n`
            );

            // Setup Three.js scene
            const scene = new THREE.Scene();
            const blockSize = 1;
            const geometry = new THREE.BoxGeometry(
                blockSize,
                blockSize,
                blockSize
            );

            // Move block processing to a separate async function
            await processBlocks(
                scene,
                blockIndices,
                palette,
                geometry,
                width,
                height,
                depth
            );

            // Export after all blocks are processed
            console.log(`[🟡] Exporting GLB...`);
            const exporter = new GLTFExporter();
            const glbBuffer = await exporter.parseAsync(scene, {
                binary: true,
            });
            fs.writeFileSync(output, glbBuffer);
            console.log(`[✅] Exported to ${output}\n`);
            console.log(`---- [📌] Program Logs End Here ----`);
        } catch (error) {
            console.error("[❌] Error processing .mcstructure:", error);
        }
    });

const materialCache = new Map<string, THREE.MeshStandardMaterial[]>();

async function getMaterials(
    blockName: string
): Promise<THREE.MeshStandardMaterial[]> {
    blockName = blockName.replace("minecraft:", "");
    if (!materialCache.has(blockName)) {
        const materials = await getBlockMaterial(blockName);
        materialCache.set(blockName, materials);
    }
    return materialCache.get(blockName)!;
}

async function processBlocks(
    scene: THREE.Scene,
    blockIndices: any,
    palette: any[],
    geometry: THREE.BoxGeometry,
    width: number,
    height: number,
    depth: number
) {
    let addedBlocks = 0;
    const airIndex = palette.findIndex(
        (block) => block.name?.value === "minecraft:air"
    );

    for (const [i, blockIndex] of blockIndices.entries()) {
        if (
            blockIndex === airIndex ||
            blockIndex >= palette.length ||
            blockIndex === -1
        )
            continue;

        const blockData = palette[blockIndex];
        if (!blockData || !blockData.name) continue;

        const blockName = blockData.name.value;
        const material = await getMaterials(blockName);
        if (!material) {
            console.error(`[❌] Material loading failed for ${blockName}`);
            continue;
        }

        const mesh = new THREE.Mesh(geometry, material);

        // Compute coordinates
        const x = Math.floor(i / (depth * height)) % width;
        const y = Math.floor(i / depth) % height;
        const z = i % depth;

        mesh.position.set(x, y, z);
        scene.add(mesh);
        addedBlocks++;
    }

    console.log(`[🔍] Added ${addedBlocks} blocks to scene.\n`);
}

async function colorizeTexture(texturePath: string, hexColor: string) {
    const image = await loadImage(texturePath);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d");

    ctx.drawImage(image, 0, 0);

    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = hexColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(image, 0, 0);

    fs.writeFileSync(texturePath, canvas.toBuffer());
}

async function getBlockMaterial(
    blockName: string
): Promise<THREE.MeshStandardMaterial[]> {
    blockName = blockName.replace("minecraft:", "");
    const modelPath = path.join(
        cwd(),
        "assets",
        "minecraft",
        "models",
        "block",
        `${blockName}.json`
    );

    if (!fs.existsSync(modelPath)) {
        console.warn(`[⚠️] Model for ${blockName} not found, using default.`);
        return Array(6).fill(
            new THREE.MeshStandardMaterial({ color: 0xff0000 })
        );
    }

    const modelData = JSON.parse(fs.readFileSync(modelPath, "utf-8"));

    const textureMap: Map<string, THREE.Texture> = new Map(); // "east" => MeshTexture ...

    // Relavant code starts from here
    const materials: THREE.MeshStandardMaterial[] = [];

    const addMaterials = () => {
        const faceMap = {
            up: 2,
            down: 3,
            north: 4,
            south: 5,
            east: 0,
            west: 1,
        } as const;

        for (const [face, faceIndex] of Object.entries(faceMap)) {
            const texture = textureMap.get(face);
            materials[faceIndex] = new THREE.MeshStandardMaterial({
                map: texture,
            });
        }
    };

    // Loading all textures
    if (modelData.textures) {
        for (const [key, textureName] of Object.entries<string>(
            modelData.textures
        )) {
            let cleanTexture = textureName.replace("minecraft:", "");
            const texturePath = path.join(
                cwd(),
                "assets",
                "minecraft",
                "textures",
                `${cleanTexture}.png`
            );

            if (fs.existsSync(texturePath)) {
                const textureLoader = new TextureLoader();
                const texture = await textureLoader.loadAsync(texturePath);
                texture.magFilter = THREE.NearestFilter;
                texture.minFilter = THREE.NearestFilter;
                textureMap.set(key, texture); // "end", "bottom", etc => MeshTexture
            } else {
                console.error(`[❌] Missing texture: ${cleanTexture}.png`);
            }
        }
    }

    // Updating texture keys.
    let parent = modelData.parent?.replace("minecraft:", "");
    let parentData = modelData;

    while (parent) {
        if (parentData.elements) {
            for (const [key, data] of Object.entries<Record<string, string>>(
                parentData.elements[0].faces
            )) {
                const textureReference = data.texture.slice(1); // Remove '#'
                const texture = textureMap.get(textureReference);
                textureMap.set(key, texture);
            }

            break;
        }
        const parentPath = path.join(
            cwd(),
            "assets",
            "minecraft",
            "models",
            `${parent}.json`
        );
        parentData = JSON.parse(fs.readFileSync(parentPath, "utf-8"));

        if (parentData.textures) {
            for (const [key, _textureReference] of Object.entries<string>(
                parentData.textures
            )) {
                const textureReference = _textureReference.slice(1); // Remove '#'
                const texture = textureMap.get(textureReference);
                textureMap.set(key, texture);
            }
        }

        parent = parentData.parent?.replace("minecraft:", "") ?? undefined;
    }

    addMaterials();

    return materials;
}

program.parse(process.argv);
