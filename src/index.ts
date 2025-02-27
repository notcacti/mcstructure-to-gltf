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
            console.log(`---- [📌] Program Logs Start Here ----\n`);

            console.log(`[🟡] 📂 Reading file: ${input}\n`);
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

            // width: x | height: y | depth: z //
            const [width, height, depth] = size;
            console.log(
                `[🔍] Raw Size: ${size}\n Structure size: ${width} x ${height} x ${depth}\n`
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
                    "[❌] Invalid or missing block_palette. 🔍:",
                    palette
                );
                return;
            }

            console.log(
                `[🔍] Extracted palette list: ${palette.length} blocks\n`
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

            // TODO: Get pack, fill out materials according to blocks.
            // Currently all materials are white.
            const materials: Record<string, THREE.Material> = {};

            // fs.writeFileSync(
            //     path.join(process.cwd(), "temp", "thing.json"),
            //     JSON.stringify(palette, null, 2)
            // );

            let addedBlocks = 0;
            // Position each block properly in the 3D Plane/Scene
            blockIndices.forEach((blockIndex, i) => {
                const airIndex = palette.findIndex(
                    (block) => block.name?.value === "minecraft:air"
                );
                // Ignore air blocks
                if (
                    blockIndex === airIndex ||
                    blockIndex >= palette.length ||
                    blockIndex === -1
                )
                    return;

                // Get block's data
                const blockData = palette[blockIndex];
                if (!blockData || !blockData.name) return;

                // TODO: Material Fixes (Currently everything is just white)
                const blockName = blockData.name.value;
                if (!materials[blockName]) {
                    materials[blockName] = new THREE.MeshStandardMaterial({
                        color: 0xffffff, // If no material is specified, make it white.
                    });
                }

                const material = materials[blockName];
                const mesh = new THREE.Mesh(geometry, material);

                // Compute Coordinates in the 3D Plane.
                const x = Math.floor(i / (depth * height)) % width;
                const y = Math.floor(i / depth) % height;
                const z = i % depth;

                // console.log(
                //     `[🔍] Block ${blockName} (${blockIndex}) at i=${i} → (x: ${x}, y: ${y}, z: ${z})`
                // );

                if (blockName === "minecraft:air") {
                    console.error(`[⚠️] Air detected while adding blocks.`);
                }

                const _x = y;
                const _y = z;
                const _z = x;

                // Add it to the 3D Scene
                mesh.position.set(x, y, z);
                // mesh.position.set(_x, _y, _z);
                scene.add(mesh);
                addedBlocks++;
            });

            console.log(`[🔍] Added ${addedBlocks} blocks to scene.\n`);

            // Export to GLB
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

program.parse(process.argv);
