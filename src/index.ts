import fs from "fs";
import { parse as parseNBT } from "prismarine-nbt";
import * as THREE from "three";
import { program } from "commander";
import path from "path";
import { GLTFExporter, TextureLoader } from "node-three-gltf";
import { cwd } from "process";

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

            // 🚀 Export after all blocks are processed
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
        const material = await getBlockMaterial(blockName);
        if (!material) continue;

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

async function getBlockMaterial(
    blockName: string
): Promise<THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[] | null> {
    blockName = blockName.slice(10); // Remove the "minecraft:" prefix.
    const modelPath = path.join(
        cwd(),
        "assets",
        "models",
        "block",
        `${blockName}.json`
    );

    const foliage = ["tall_grass", "fern"];

    if (foliage.includes(blockName)) {
        console.warn(
            `[🍃] Foliage such as ${blockName} is not currently supported. Skipping.`
        );
        return null;
    }

    if (!fs.existsSync(modelPath)) {
        console.error(`[❌] Model for ${blockName} not found.`);
        return new THREE.MeshStandardMaterial({ color: 0xffffff }); // Default white material
    }

    const modelData: Record<string, string> = JSON.parse(
        fs.readFileSync(modelPath, "utf-8")
    );
    const textureMap: Record<string, THREE.Texture> = {};

    // Load textures based on model definition
    if (modelData.textures) {
        for (const [key, _textureName] of Object.entries<string>(
            modelData.textures
        )) {
            let textureName: string = _textureName;

            if (_textureName.startsWith("minecraft:"))
                textureName = _textureName.slice(10);

            const texturePath = path.join(
                cwd(),
                "assets",
                "textures",
                `${textureName}.png`
            );
            if (fs.existsSync(texturePath)) {
                const textureLoader = new TextureLoader();
                textureMap[key] = await textureLoader.loadAsync(texturePath);
            } else {
                console.warn(`[⚠️] Texture ${textureName}.png not found.`);
            }
        }
    }

    // If the model has specific faces, create a material array
    if (modelData.elements) {
        const materials: THREE.MeshStandardMaterial[] = [];

        const faceMap = ["bottom", "top", "north", "south", "west", "east"];
        for (const face of faceMap) {
            materials.push(
                new THREE.MeshStandardMaterial({
                    map: textureMap[face] || textureMap["side"] || null,
                })
            );
        }

        return materials;
    }
}

program.parse(process.argv);
