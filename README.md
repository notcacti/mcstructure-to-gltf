# Minecraft .mcstructure to .glb Converter

## Overview

This tool allows you to convert Minecraft `.mcstructure` files into `.glb` format for use in Blender and other 3D modeling software. It reads `.mcstructure` files, extracts block data, and generates a 3D scene using Three.js before exporting it as a `.glb` file.

## Features

-   Parses `.mcstructure` files using `prismarine-nbt`.
-   Converts block structures into a Three.js 3D scene.
-   Supports textured blocks by reading Minecraft's model and texture data.
-   Exports `.glb` files using `node-three-gltf`.
-   Handles air blocks efficiently to optimize scene performance.
-   Supports block colorization and material caching for faster processing.

## Installation

### Prerequisites

Ensure you have the following installed:

-   [Node.js](https://nodejs.org/) (LTS recommended)
-   NPM or Yarn

### Setup

1. Clone this repository:
    ```sh
    git clone https://github.com/notcacti/mcstructure-to-gltf.git
    cd mcstructure-to-gltf
    ```
2. Install dependencies:
    ```sh
    npm install
    ```

## Usage

Run the command with the input `.mcstructure` file and desired output `.glb` file:

```sh
node index.js <input.mcstructure> <output.glb>
```

Example:

```sh
node index.js house.mcstructure house.glb
```

## How It Works

1. **Reading File**: The `.mcstructure` file is read and parsed using `prismarine-nbt`.
2. **Extracting Block Data**:
    - The structure's size is determined.
    - Block indices and palette are extracted.
3. **Creating the 3D Scene**:
    - A Three.js scene is initialized.
    - Blocks are placed in the scene based on extracted data.
    - Textures are loaded from Minecraft's assets.
4. **Exporting to GLB**:
    - The final scene is converted into `.glb` format.

## Advanced Features

### Block Material Handling

-   Block textures are loaded based on Minecraft's model JSON files.
-   Textures are colorized if necessary.
-   Materials are cached for efficiency.

### Air Block Optimization

-   Air blocks are ignored during processing to optimize performance.

## Troubleshooting

### Missing Textures

If you see an error like:

```
[❌] Missing texture: stone.png
```

Ensure you have the correct Minecraft assets in the `assets/minecraft/textures/` directory.

### Invalid .mcstructure File

If you receive:

```
[❌] Invalid .mcstructure file format.
```

The input file may be corrupted or not a valid `.mcstructure` file.

## License

This project is licensed under the MIT License.
