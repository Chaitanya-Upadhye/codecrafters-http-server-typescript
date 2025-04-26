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

        if(httpReqLine[1]==="/"){
            socket.write("HTTP/1.1 200 OK\r\n\r\n")
            
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
