import * as net from "net";
import { pathToRegexp } from "path-to-regexp";

// This is a basic HTTP server that listens on port 4221 and handles incoming requests.
const server = net.createServer((socket) => {

    socket.on("close", () => {
        socket.end();
    });


});
server.on("connection", async (socket) => {
    try {
        await onConnection(socket);
    } catch (error) {
        console.error("Error in connection handler:", error);
    }
    finally {
        socket.destroy()
    }
})
server.listen(4221, "localhost");


//********************************** UTILS ********************************************/
// This function extracts the request headers from the raw HTTP request string.
function getRequestHeaders(rawHttpReqString: string) {
    const httpReqString = rawHttpReqString.split("\r\n");
    const headersString = httpReqString.slice(1, httpReqString.length - 2);
    const headers={};
    for (const header of headersString) {
        const [key, value] = header.split(": ");
        headers[key] = value;
    }
    return headers
}
//**************** HTTP handler **************** */
class HttpHandler {
    handlers = new Map();
    register(endpoint = '', handler: any) {
        const {regexp,keys}=pathToRegexp(endpoint);

        this.handlers.set(endpoint, {handler,regexp,keys});
    }
    async handleRequest(data: Buffer<ArrayBufferLike>) {
       
        const rawHttpReqString = data.toString();
        const httpReqString = rawHttpReqString.split("\r\n");
        const headers = getRequestHeaders(rawHttpReqString);
        const httpReqLine = httpReqString[0].split(" ");
        for (const [route,{regexp,handler,keys}] of this.handlers.entries()) {
            if(regexp.test(httpReqLine[1]))
            {
                const match = regexp.exec(httpReqLine[1]);
                const params:any = {};
                if (match) {
                    for (let i = 0; i < keys.length; i++) {
                        params[keys[i].name] = match[i + 1];
                    }
                }
                return await handler(rawHttpReqString,params,headers);
            }
        }
       
        return "HTTP/1.1 404 Not Found\r\n\r\n";
     }


}


//**************** Controllers **************** */
const httpHandler = new HttpHandler();
httpHandler.register('/', GetIndexRequestHandler)
httpHandler.register('/echo/:message', EchoRequestHandler);
httpHandler.register('/echo/:message', EchoRequestHandler);
httpHandler.register('/user-agent', UserAgentEchoRequestHandler);
httpHandler.register('/file/:filename', fileHandler);
async function fileHandler(rawHttpReqString: string,params:any) {
const dir=Bun.argv[3];

const file = Bun.file(`${import.meta.dirname}${dir}${params.filename}`);

const exists=await file.exists(); // boolean;
if (!exists) {
    return "HTTP/1.1 404 Not Found\r\n\r\n";
}
const fileContent = await file.text(); // string;
const fileSize = file.size; // number;

return `HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Length: ${fileSize}\r\n\r\n${fileContent}`;

}

async function GetIndexRequestHandler(rawHttpReqString: string,params:any) {
    const httpReqString = rawHttpReqString.split("\r\n");
    const httpReqLine = httpReqString[0].split(" ");
    const httpPath = httpReqLine[1].split('/').filter((item) => item !== "");

    if (httpPath.length === 0) {
        return "HTTP/1.1 200 OK\r\n\r\n";
    }
    return "HTTP/1.1 200 OK\r\n\r\n";


}
async function EchoRequestHandler(rawHttpReqString: string) {
    const httpReqString = rawHttpReqString.split("\r\n");
    const httpReqLine = httpReqString[0].split(" ");
    const httpPath = httpReqLine[1].split('/').filter((item) => item !== "");

     return `HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: ${httpPath[1].length}\r\n\r\n${httpPath[1]}`



}
async function UserAgentEchoRequestHandler(rawHttpReqString: string,params:any,headers:any) {
    return `HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: ${headers['User-Agent'].length}\r\n\r\n${headers['User-Agent']}`;
}



//**************** Socket handlers *****************/

async function socketRead(tcpConnWrapper: { socket: net.Socket, reader: any, ended?: boolean }) {
    return new Promise((resolve, reject) => {
        if (tcpConnWrapper.ended) {
            resolve(Buffer.from(''));
            return;
        }
        tcpConnWrapper.reader = { resolve, reject };
        tcpConnWrapper.socket.resume();
    });
}
async function socketWrite(tcpConnWrapper: { socket: net.Socket, reader: any, ended?: boolean }, data: Buffer<ArrayBufferLike>): Promise<void> {
    return new Promise((resolve, reject) => {
        if (tcpConnWrapper.ended) {
            resolve();
            return;
        }
        tcpConnWrapper.socket.write(data, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });

    });
}
async function onConnection(socket: net.Socket) {
    const tcpConnWrapper = {
        socket,
        reader: null,
        ended: false
    }
    socket.on("data", (data) => {
        socket.pause();
        tcpConnWrapper.reader?.resolve(data);
        tcpConnWrapper.reader = null;
    })
    socket.on("end", () => {
        tcpConnWrapper.ended = true;
        if (tcpConnWrapper.reader) {
            tcpConnWrapper.reader?.resolve(Buffer.from(''));
            tcpConnWrapper.reader = null;
        }
    })

    while (true) {
        const data = await socketRead(tcpConnWrapper)
        if (data.length === 0) {
            break;
        }
        const resp= await httpHandler.handleRequest(data);

        await socketWrite(tcpConnWrapper, Buffer.from(resp));

    }


    
  
}