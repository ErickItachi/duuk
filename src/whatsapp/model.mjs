export const kindLabels={text:'Mensagem',image:'Imagem',audio:'Áudio',video:'Vídeo',document:'Documento',sticker:'Figurinha',contacts:'Contato compartilhado',location:'Localização',order:'Pedido',unsupported:'Abra no WhatsApp Business',system:'Aviso do WhatsApp',button:'Resposta',interactive:'Resposta',reaction:'Reação'}
export const statusLabels={RECEIVED:'Recebida',PREPARING:'Preparando',SENDING:'Enviando',UNCERTAIN:'Confirmar resultado',SENT:'Enviada',DELIVERED:'Entregue',READ:'Lida',FAILED:'Falha no envio'}
export const emojis=['😀','😊','❤️','👍','🙏','🎬','🎉','👏','✅','👀','🔥','😂']
export const dateTime=v=>v?new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'—'
export const freeUntil=t=>t?.last_customer_at?new Date(t.last_customer_at).getTime()+24*3600000:0
export const canReply=(status,t,now=Date.now())=>status?.connected===true&&t?.status==='open'&&freeUntil(t)>now+120000
export function fileKind(file){const ext=file.name.toLowerCase().split('.').pop();if(file.type==='image/webp'||ext==='webp')return 'sticker';if(file.type.startsWith('image/'))return 'image';if(file.type.startsWith('audio/'))return 'audio';if(file.type.startsWith('video/'))return 'video';return 'document'}
export const acceptFiles='.jpg,.jpeg,.png,.webp,.mp3,.m4a,.aac,.amr,.ogg,.opus,.mp4,.3gp,.pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx'
