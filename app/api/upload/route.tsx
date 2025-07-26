import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'

export async function POST(req: Request) {
  const formData = await req.formData()
  const file: File | null = formData.get('file') as unknown as File
  const path = formData.get('path') as string

  if (!file || !path) {
    return NextResponse.json({ error: 'Missing file or path' }, { status: 400 })
  }

  // Construct the destination filename
  // e.g., "f1/2025/imagename.jpg"
  const destFilename = `${path.replace(/\/+$/,'')}/${file.name}`

  // Upload using Vercel Blob
  const blob = await put(destFilename, file, { access: 'public' })

  // Construct the desired "bmb-content-server.vercel.app/..." URL as required
  const url = `https://bmb-content-server.vercel.app/${destFilename}`

  return NextResponse.json({ url, blobUrl: blob.url })
}
