import fs from "fs";
import { parse as parseNBT } from "prismarine-nbt";
import * as THREE from "three";
import { program } from "commander";
import path from "path";
import { GLTFExporter } from "node-three-gltf";

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
            console.log(`📂 Reading file: ${input}`);
            const buffer = fs.readFileSync(input);
            const { parsed } = await parseNBT(buffer);
            const root = parsed.value;
            const structure = root.structure?.value;

            if (!structure)
                throw new Error("Invalid .mcstructure file format.");

            const outputDir = path.dirname(output);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            /* Relavant Code Starts From Here */

            // Extract size
            // @ts-ignore
            const size = root.size?.value?.value; // trust me bro you can access value in it but typescript doesn't know

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
                `[DEBUG] Structure size: ${width} x ${height} x ${depth}`
            );

            // Extract block indices
            let blockIndices =
                // @ts-ignore
                structure.block_indices?.value?.value?.[0]?.value;
            if (!Array.isArray(blockIndices)) {
                throw new Error("[❌] Missing or malformed block_indices.");
            }

            // Extract block palette
            let palette =
                // @ts-ignore
                structure.palette?.value?.default?.value?.block_palette?.value;
            if (!Array.isArray(palette) && palette?.value) {
                palette = palette.value;
            }

            if (!Array.isArray(palette)) {
                console.error(
                    "[❌] Invalid or missing block_palette. Debug:",
                    palette
                );
                return;
            }

            console.log(
                `[DEBUG] Extracted palette list: ${palette.length} blocks`
            );

            // Setup Three.js scene
            const scene = new THREE.Scene();
            const blockSize = 1;

            // Create cube geometry
            const geometry = new THREE.BoxGeometry(
                blockSize,
                blockSize,
                blockSize
            );
            const materials: Record<string, THREE.Material> = {};

            let addedBlocks = 0;

            blockIndices.forEach((blockIndex, i) => {
                if (blockIndex === -1 || blockIndex >= palette.length) return;

                const blockData = palette[blockIndex];
                if (!blockData || !blockData.name) return;

                const blockName = blockData.name.value;
                if (!materials[blockName]) {
                    materials[blockName] = new THREE.MeshStandardMaterial({
                        color: Math.random() * 0xffffff, // Random color per block type
                    });
                }

                const material = materials[blockName];
                const mesh = new THREE.Mesh(geometry, material);

                // Compute 3D position
                const x = i % width;
                const y = Math.floor(i / (width * depth)) % height;
                const z = Math.floor(i / (width * height));

                mesh.position.set(x, y, z);
                scene.add(mesh);
                addedBlocks++;
            });

            console.log(`[DEBUG] Added ${addedBlocks} blocks to scene.`);

            // Export to GLB
            const exporter = new GLTFExporter();
            const glbBuffer = await exporter.parseAsync(scene, {
                binary: true,
            });
            fs.writeFileSync(output, glbBuffer);

            console.log(`[DEBUG] Exported to ${output}`);
        } catch (error) {
            console.error("[❌] Error processing .mcstructure:", error);
        }
    });

program.parse(process.argv);
