// Local TLS fixture only. DUUK_TEST_TLS_CERT / DUUK_TEST_TLS_KEY point to a
// short-lived localhost certificate. No real mailbox or production API is used.
import { ImapFlow } from "npm:imapflow@2.2.6";
import { NativeImapSocket, nativeImapTransport } from "../functions/_shared/imap-transport.mjs";
import { mailFailure } from "../functions/_shared/mail-failure.mjs";

const cert = await Deno.readTextFile(Deno.env.get("DUUK_TEST_TLS_CERT")!);
const key = await Deno.readTextFile(Deno.env.get("DUUK_TEST_TLS_KEY")!);
const ca = await Deno.readTextFile(Deno.env.get("DUUK_TEST_TLS_CA")!);
const message = "From: Fixture <fixture@example.com>\r\nSubject: Local fixture\r\n\r\nFixture body\r\n";
const encoder = new TextEncoder();
const assert = (value: unknown, description: string) => { if (!value) throw new Error(description); };

async function fixture(rejectPassword = false) {
  const listener = Deno.listenTls({hostname:"127.0.0.1",port:0,cert,key});
  const port = (listener.addr as Deno.NetAddr).port;
  let authenticated = false;
  const server = (async () => {
    const socket = await listener.accept();
    async function send(value: string) {
      const bytes=encoder.encode(value);let offset=0;
      while(offset<bytes.length)offset+=await socket.write(bytes.subarray(offset));
    }
    try {
      await send("* OK [CAPABILITY IMAP4rev1 ID AUTH=PLAIN NAMESPACE UIDPLUS] Fixture ready\r\n");
      let buffer="",authTag="";const bytes=new Uint8Array(4096);
      while(true){
        const n=await socket.read(bytes);if(n===null)break;
        buffer+=new TextDecoder().decode(bytes.subarray(0,n));
        let end;
        while((end=buffer.indexOf("\r\n"))!==-1){
          const line=buffer.slice(0,end);buffer=buffer.slice(end+2);
          if(authTag){
            assert(atob(line)==="\0contato@duukfilms.com\0fixture-password","Fixture credential bytes changed");
            await send(rejectPassword?`${authTag} NO [AUTHENTICATIONFAILED] Fixture rejection\r\n`:`${authTag} OK Authenticated\r\n`);
            authenticated=!rejectPassword;authTag="";continue;
          }
          const [tag,...words]=line.split(" "),command=words.join(" ");
          if(command.startsWith("ID "))await send(`* ID ("name" "DUUK fixture" "version" "1")\r\n${tag} OK ID\r\n`);
          else if(command.startsWith("AUTHENTICATE")){authTag=tag;await send("+ \r\n");}
          else if(command==="CAPABILITY")await send(`* CAPABILITY IMAP4rev1 ID AUTH=PLAIN NAMESPACE UIDPLUS\r\n${tag} OK Capabilities\r\n`);
          else if(command==="NAMESPACE")await send(`* NAMESPACE (("" "/")) NIL NIL\r\n${tag} OK Namespace\r\n`);
          else if(command.startsWith("LIST")||command.startsWith("LSUB"))await send(`* LIST (\\HasNoChildren) "/" "INBOX"\r\n${tag} OK List\r\n`);
          else if(command.startsWith("EXAMINE")||command.startsWith("SELECT"))await send(`* FLAGS (\\Seen)\r\n* 1 EXISTS\r\n* OK [UIDVALIDITY 7] Validity\r\n* OK [UIDNEXT 2] Next\r\n${tag} OK [READ-ONLY] Selected\r\n`);
          else if(command.startsWith("UID SEARCH"))await send(`* SEARCH 1\r\n${tag} OK Search\r\n`);
          else if(command.startsWith("UID FETCH"))await send(`* 1 FETCH (UID 1 FLAGS (\\Seen) BODY[] {${encoder.encode(message).length}}\r\n${message})\r\n${tag} OK Fetch\r\n`);
          else if(command==="LOGOUT"){await send(`* BYE Goodbye\r\n${tag} OK Logout\r\n`);return;}
          else await send(`${tag} OK Completed\r\n`);
        }
      }
    } finally {socket.close();}
  })();
  server.catch(()=>{});
  const client=nativeImapTransport(new ImapFlow({host:"imap.secureserver.net",port:993,secure:true,auth:{user:"contato@duukfilms.com",pass:"fixture-password"},logger:false,disableAutoIdle:true}),()=>new NativeImapSocket(()=>Deno.connectTls({hostname:"127.0.0.1",port,caCerts:[ca]})));
  client.on("error",()=>{});
  return {client,server,close:()=>listener.close(),isAuthenticated:()=>authenticated};
}

Deno.test("native IMAP authenticates, selects, searches and fetches a message over verified TLS",async()=>{
  const f=await fixture();
  try{
    await f.client.connect();assert(f.isAuthenticated(),"Authentication missing");
    const lock=await f.client.getMailboxLock("INBOX",{readOnly:true});
    try{
      const found=await f.client.search({all:true},{uid:true});assert(found&&found[0]===1,"UID search failed");
      const record=await f.client.fetchOne(1,{source:true,flags:true},{uid:true});
      assert(record&&record.source?.toString()===message,"Literal body was not preserved");
    }finally{lock.release();}
    await f.client.logout();await f.server;
  }finally{f.client.close();f.close();}
});

Deno.test("provider authentication rejection is distinct from a broken TLS connection",async()=>{
  const f=await fixture(true);
  try{
    let failure;
    try{await f.client.connect();}catch(error){failure=mailFailure(error,"imap");}
    assert(failure?.status===422&&failure?.kind==="authentication","Wrong failure category");
    assert(!f.isAuthenticated(),"Rejected fixture authenticated");
  }finally{f.client.close();await f.server;f.close();}
});
