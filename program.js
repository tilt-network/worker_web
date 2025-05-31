let wasmInstance;
let memory;
// const baseUrl = "http://localhost:3000";
const baseUrl = "https://staging.tilt.rest";

async function initProgram(program_path, data_path) {
    const dataResponse = await fetch(`${baseUrl}/tasks/data/${data_path}`);
    const data = await dataResponse.arrayBuffer(); // leu como bytes puros
    const response = await fetch(`${baseUrl}/programs/files/${program_path}`);
    const bytes = await response.arrayBuffer();

    const wasmModule = await WebAssembly.instantiate(bytes, {
        env: {
            // memory: new WebAssembly.Memory({
            //     initial: 160,
            //     maximum: 160,
            // }),
            // ...
        },
    });
    wasmInstance = wasmModule.instance;
    memory = wasmInstance.exports.memory;

    return data;
}

async function sendDataProcessed(data, task_id, unprocessed_data_path) {
    const processed_data_path = unprocessed_data_path
        .replace("/unprocessed/", "/processed/")
        .replace(/\.wasm$/, ".dat");
    const formData = new FormData();

    formData.append("task_id", task_id);
    formData.append("path", processed_data_path);

    blob = new Blob([data], { type: "application/octet-stream" });
    formData.append("data", blob, "data.bin");

    try {
        const response = await fetch(`${baseUrl}/tasks/processed_data`, {
            method: "POST",
            body: formData,
        });

        if (!response.ok) {
            throw new Error(`Error: ${response.status} ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error("Error sending processed data:", error);
        throw error;
    }
}

function getBytes(ptr, len) {
    return new Uint8Array(memory.buffer, ptr, len).slice();
}

function passString(str) {
    const encoder = new TextEncoder();
    const encoded = encoder.encode(str);
    const ptr = wasmInstance.exports.alloc(encoded.length);
    new Uint8Array(memory.buffer, ptr, encoded.length).set(encoded);
    return { ptr, len: encoded.length };
}

async function passData(data) {
    let bytes;
    if (typeof data === "string") {
        bytes = new TextEncoder().encode(data);
    } else if (data instanceof Blob) {
        bytes = new Uint8Array(await data.arrayBuffer());
    } else if (data instanceof ArrayBuffer) {
        bytes = new Uint8Array(data);
    } else if (data instanceof Uint8Array) {
        bytes = data;
    } else {
        throw new Error("Type not supported");
    }

    const ptr = wasmInstance.exports.alloc(bytes.length);
    new Uint8Array(memory.buffer, ptr, bytes.length).set(bytes);
    return { ptr, len: bytes.length };
}

async function executeProgram(data) {
    const { ptr, len } = await passData(data);
    // const { ptr, len } = passString(data);
    const retptr = wasmInstance.exports.alloc(8);

    wasmInstance.exports.execute(retptr, ptr, len);

    const resultView = new Uint32Array(memory.buffer, retptr, 2);
    const result_ptr = resultView[0];
    const result_len = resultView[1];

    const output = getBytes(result_ptr, result_len);

    wasmInstance.exports.free_buffer(ptr, len);
    wasmInstance.exports.free_buffer(result_ptr, result_len);
    wasmInstance.exports.free_buffer(retptr, 8);

    return output;
}
