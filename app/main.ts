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

function serializeResponse(response:{status:number,reasonPhrase:string,httpVersion:string,headers:{},body:string}) {
    const {status,reasonPhrase,httpVersion,headers,body}=response;
    let responseString = `${httpVersion} ${status} ${reasonPhrase}\r\n`;
    for (const [key,value] of Object.entries(headers)) {
        responseString += `${key}: ${value}\r\n`;
    }
    return `${responseString}\r\n`;
}

//**************** HTTP handler **************** */
class HttpHandler {
    handlers = new Map();
    postHandlers= new Map();
    register(endpoint = '', handler: any) {
        const {regexp,keys}=pathToRegexp(endpoint);

        this.handlers.set(endpoint, {handler,regexp,keys});
    }
    registerPost(endpoint = '', handler: any) {
        const {regexp,keys}=pathToRegexp(endpoint);

        this.postHandlers.set(endpoint, {handler,regexp,keys});
    }

    async handleRequest(data: Buffer<ArrayBufferLike>) {
       
        const rawHttpReqString = data.toString();
        const httpReqString = rawHttpReqString.split("\r\n");
        const headers = getRequestHeaders(rawHttpReqString);
        const requestBodyRaw = httpReqString[httpReqString.length - 1];
        const contentLength = headers['Content-Length'] ? parseInt(headers['Content-Length']) : 0;
        let body = '';
        if (contentLength > 0) {body = requestBodyRaw.slice(0, contentLength);}
        const httpReqLine = httpReqString[0].split(" ");
        const httpMethod = httpReqLine[0];
        const handlers = httpMethod === 'POST' ? this.postHandlers : this.handlers;
        const response={
            status:200,
            reasonPhrase:'OK',
            httpVersion:'HTTP/1.1',
            headers:{},
            body:''
        };

        for (const [route,{regexp,handler,keys}] of handlers.entries()) {
            if(regexp.test(httpReqLine[1]))
            {
                const match = regexp.exec(httpReqLine[1]);
                const params:any = {};
                if (match) {
                    for (let i = 0; i < keys.length; i++) {
                        params[keys[i].name] = match[i + 1];
                    }
                }
                const resp= await handler(rawHttpReqString,params,headers,body,response);
                if(typeof resp === 'string')
                {
                    return resp;
                }
               if(resp.body.length){ resp.headers['Content-Type'] = resp.headers['Content-Type'] || 'text/plain';
                resp.headers['Content-Length'] = resp.body.length;}
        
                if(headers['Accept-Encoding'] && headers['Accept-Encoding'].includes('gzip'))
                {
                    resp.headers['Content-Encoding'] = 'gzip';
                    resp.body = Bun.gzipSync(resp.body);
                    resp.headers['Content-Length'] = resp.body.length;
                }
                if(headers['Connection'] && headers['Connection'].includes('close'))
                {   
                    resp.headers['Connection'] = 'close';
                }

                 return Buffer.concat([Buffer.from(serializeResponse(resp),'utf-8'), Buffer.from(resp.body)]); ;
               
            }
        }
       
        return Buffer.from("HTTP/1.1 404 Not Found\r\n\r\n");
     }


}


//**************** Controllers **************** */
const httpHandler = new HttpHandler();
httpHandler.register('/', GetIndexRequestHandler)
httpHandler.register('/echo/:message', EchoRequestHandler);
httpHandler.register('/user-agent', UserAgentEchoRequestHandler);
httpHandler.register('/files/:filename', fileHandler);
httpHandler.registerPost('/files/:filename', fileHandlerPost);


async function fileHandlerPost(rawHttpReqString: string,params:any,headers:any,body:string,response:any) {
    const dir=Bun.argv[3];
    await Bun.write(`${dir}${params.filename}`, body);
    response.status=201;
    response.reasonPhrase='Created';
    return response;
    return `HTTP/1.1 201 Created\r\n\r\n`
    
}
async function fileHandler(rawHttpReqString: string,params:any,headers:any,body:any,response:any) {
const dir=Bun.argv[3];
const file = Bun.file(`${dir}${params.filename}`);

const exists=await file.exists(); // boolean;

if (!exists) {
    response.status=404;
    response.reasonPhrase='Not Found';
    return response;
    return "HTTP/1.1 404 Not Found\r\n\r\n";
}

const fileContent = await file.text(); // string;
const fileSize = file.size; // number;

response.body = fileContent;
response.headers['Content-Type'] = 'application/octet-stream';
response.headers['Content-Length'] = fileSize;
return response;
return `HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Length: ${fileSize}\r\n\r\n${fileContent}`;

}

async function GetIndexRequestHandler(rawHttpReqString: string,params:any,headers:any,requestBodyRaw:string,response:any) {
response.body = '';
return response;    


}
async function EchoRequestHandler(rawHttpReqString: string,params:any,headers:any,requestBodyRaw:string,response:any) {
    const httpReqString = rawHttpReqString.split("\r\n");
    const httpReqLine = httpReqString[0].split(" ");
    const httpPath = httpReqLine[1].split('/').filter((item) => item !== "");
    response.body = httpPath[1];
    response.headers['Content-Type'] = 'text/plain';
    response.headers['Content-Length'] = response.body.length;
    return response;



}
async function UserAgentEchoRequestHandler(rawHttpReqString: string,params:any,headers:any,requestBodyRaw:string,response:any) {
    response.body = headers['User-Agent'];
    return response;
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

        await socketWrite(tcpConnWrapper,resp);
        const headers= getRequestHeaders(data.toString());
        if (headers['Connection'] && headers['Connection'].includes('close')) {
            break;
        }


    }


    
  
}