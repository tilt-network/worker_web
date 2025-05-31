const statusEl = document.getElementById("status");
const sentEl = document.getElementById("sent");
const logEl = document.getElementById("log");
const resultEl = document.getElementById("result");
const taskEl = document.getElementById("task");
const deviceIdEl = document.getElementById("device_id");

// Opções de conexão MQTT com reconexão automática
// const mqttOptions = {
//     reconnectPeriod: 5000, // Tenta reconectar a cada 5 segundos
//     connectTimeout: 30000, // Tempo limite de 30 segundos para conexão
//     keepalive: 60, // Keep alive a cada 60 segundos
// };
// const client = mqtt.connect("wss://test.mosquitto.org:8081", mqttOptions);

const mqttOptions = {
    username: "jmaxtilt",
    password: "1qa@WS",
    reconnectPeriod: 5000,
    connectTimeout: 30000,
    keepalive: 60,
    // obrigatório para WebSocket sobre TLS
    protocol: "wss",
    clientId: "web_client_" + Math.random().toString(16).substr(2, 8),
};

const client = mqtt.connect(
    "wss://a784cd4c2bed42e383a6c185644b5eaf.s1.eu.hivemq.cloud:8884/mqtt",
    mqttOptions,
);

// let client_id = "axum_api_client_subscriber";
// let broker_host = "a784cd4c2bed42e383a6c185644b5eaf.s1.eu.hivemq.cloud";
// let broker_port = 8883;

// let mut mqtt_options = MqttOptions::new(client_id, broker_host, broker_port);
// mqtt_options.set_transport(rumqttc::Transport::tls_with_default_config());
// mqtt_options.set_keep_alive(Duration::from_secs(5));
// mqtt_options.set_credentials("jmaxtilt", "1qa@WS");

class Uuid {
    static v4() {
        return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
            (
                c ^
                (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
            ).toString(16),
        );
    }
}

class Device {
    constructor({
        device_id,
        model,
        brand,
        year,
        battery_level,
        battery_state,
        is_in_battery_save_mode,
        available,
        score_cpu,
        score_mem,
        created_at,
    }) {
        this.deviceId = device_id;
        this.model = model;
        this.brand = brand;
        this.year = year;
        this.batteryLevel = battery_level;
        this.batteryState = battery_state;
        this.isInBatterySaveMode = is_in_battery_save_mode;
        this.available = available;
        this.scoreCpu = score_cpu;
        this.scoreMem = score_mem;
        this.createdAt = created_at;
    }

    toString() {
        let snake_object = {
            device_id: this.deviceId,
            model: this.model,
            brand: this.brand,
            year: this.year,
            battery_level: this.batteryLevel,
            battery_state: this.batteryState,
            is_in_battery_save_mode: this.isInBatterySaveMode,
            available: this.available,
            score_cpu: this.scoreCpu,
            score_mem: this.scoreMem,
            created_at: new Date().toISOString(),
        };
        return JSON.stringify(snake_object);
    }

    toStatusString() {
        const deviceDataStr = this.toString();
        return `{"status":${deviceDataStr}}`;
    }
}

let deviceData = new Device({
    device_id: Uuid.v4(),
    model: "web browser",
    brand: "web browser",
    year: 2025,
    battery_level: 100,
    battery_state: "charging",
    is_in_battery_save_mode: true,
    available: true,
    score_cpu: 100,
    score_mem: 100,
});

deviceIdEl.textContent = deviceData.deviceId;

class Task {
    constructor({
        task_id,
        created_at,
        data,
        data_path,
        data_size,
        initiator_id,
        program_path,
        score_cpu,
        score_mem,
    }) {
        this.taskId = task_id;
        this.createdAt = new Date(created_at * 1000); // Convert UNIX timestamp to Date
        this.data = data;
        this.dataPath = data_path;
        this.dataSize = data_size;
        this.initiatorId = initiator_id;
        this.programPath = program_path;
        this.scoreCpu = score_cpu;
        this.scoreMem = score_mem;
    }
}

class DeviceData {
    constructor({ status, task }) {
        if (status != undefined) {
            this.messageType = "status";
            this.status = new Device(status);
        }
        if (task != undefined) {
            this.messageType = "task";
            this.task = new Task(task);
        }
    }

    static fromJson(jsonString) {
        console.log("from json");
        try {
            const data = JSON.parse(jsonString);
            return new DeviceData(data);
        } catch (error) {
            console.error("Invalid JSON string", error);
        }
    }
}

client.on("connect", () => {
    statusEl.textContent = "Connected";
    //                rust/devices/f38b3363-03e5-44d5-a6d2-1935696c9f52/data
    client.subscribe(`rust/devices/${deviceData.deviceId}/data`);

    const msg = deviceData.toStatusString();
    client.publish(`rust/devices/${deviceData.deviceId}/data`, msg);
    sentEl.textContent = msg;

    setInterval(() => {
        const msg = deviceData.toStatusString();
        client.publish(`rust/devices/${deviceData.deviceId}/data`, msg);
        sentEl.textContent = msg;
    }, 5000);
});

client.on("message", (topic, messageString) => {
    console.log("message arrived", topic, messageString.toString());
    const div = document.createElement("div");
    const message = DeviceData.fromJson(messageString);
    console.log("message", message);
    if (message.messageType == "task") {
        console.log("task", message);
        div.textContent = `[${new Date().toLocaleTimeString()}] ${messageString.toString()}`;
        taskEl.prepend(div);
        initProgram(message.task.programPath, message.task.dataPath).then(
            async (data) => {
                // const stringData = JSON.stringify(message.task.data);
                let output = await executeProgram(data);
                console.log("output", output);
                // document.getElementById("result").textContent = output;
                const taskDiv = document.createElement("div");
                try {
                    let outputStr = new TextDecoder("utf-8").decode(output);
                    taskDiv.textContent = `[${new Date().toLocaleTimeString()}] ${outputStr}`;
                } catch {}
                resultEl.prepend(taskDiv);
                sendDataProcessed(
                    output,
                    message.task.taskId,
                    message.task.dataPath,
                )
                    .then((response) =>
                        console.log("Data sent successfully:", response),
                    )
                    .catch((error) =>
                        console.error("Error sending data:", error),
                    );
            },
        );

        return;
    } else if (message.messageType == "status") {
        div.textContent = `[${new Date().toLocaleTimeString()}] ${messageString.toString()}`;
        logEl.prepend(div);
    }
});

client.on("error", (err) => {
    statusEl.textContent = "Error: " + err.message;
});

client.on("close", () => {
    statusEl.textContent = "Disconnected";
});

client.on("offline", () => {
    statusEl.textContent = "Offline - Trying to reconnect...";
});

client.on("reconnect", () => {
    statusEl.textContent = "Reconnecting...";
});
