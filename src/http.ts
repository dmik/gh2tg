const Decoder = new TextDecoder ();


export async function readBodyWithLimit (request_: Request, limit_: number): Promise <string | null>
{
  const contentLength = Number (request_.headers.get ('content-length'));
  if (Number.isFinite (contentLength) && contentLength > limit_)
    return null;

  if (! request_.body)
    return '';

  const reader = request_.body.getReader ();
  const chunks: Uint8Array [] = [];
  let length = 0;

  while (true)
  {
    const { done, value } = await reader.read ();
    if (done)
      break;

    length += value.byteLength;
    if (length > limit_)
    {
      await reader.cancel ();
      return null;
    }

    chunks.push (value);
  }

  const body = new Uint8Array (length);
  let offset = 0;
  for (const chunk of chunks)
  {
    body.set (chunk, offset);
    offset += chunk.byteLength;
  }

  return Decoder.decode (body);
}
