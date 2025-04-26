import * as net from "net";

// You can use print statements as follows for debugging, they'll be visible when running tests.
console.log("Logs from your program will appear here!");

const server = net.createServer((socket) => {
    
  socket.on("close", () => {
    socket.end();
  });


});
server.on("connection",(socket)=>{
    socket.on("data", (data) => {
        const rawHttpReqString= data.toString();
        const httpReqString = rawHttpReqString.split("\r\n");
        const httpReqLine = httpReqString[0].split(" ");
        const httpPath=httpReqLine[1].split('/').filter((item) => item !== "");

        if(httpPath[0]==='echo'){
            socket.write(`HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: ${httpPath[1].length}\r\n\r\n${httpPath[1]}`);
            
        }else{
            socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
        }
        socket.end()

    });
    socket.on("error", (err) => {
        console.error("Socket error:", err);
    });
})
server.listen(4221, "localhost");
