import { WebSocketServer } from "ws";

const wss = new WebSocketServer({
  port: 4001,
});

wss.on("connection", function connection(ws) {
  ws.on("message", (data) => {
    console.log(data.toString());
  });
});
