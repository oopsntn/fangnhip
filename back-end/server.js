import express from "express";
import fetch from "node-fetch";
import * as mm from 'music-metadata';
import dotenv from "dotenv";
import { XMLParser } from "fast-xml-parser";
import { classifyAudioQuality } from "./src/ultis/ClassifyAudioQuality.js";
dotenv.config();

const app = express();
const PORT = process.env.PORT
const DLNA_URL = process.env.DLNA_URL

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  allowBooleanAttributes: true,
  parseTagValue: true,
  parseAttributeValue: true,
  trimValues: true,
});

async function fetchWithTimeout(url, options = {}, timeout = 5000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(id);
  }
}
// ✅ Tách riêng các utility functions
const createSoapBody = (objectId) => `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">
      <ObjectID>${objectId}</ObjectID>
      <BrowseFlag>BrowseDirectChildren</BrowseFlag>
      <Filter>*</Filter>
      <StartingIndex>0</StartingIndex>
      <RequestedCount>0</RequestedCount>
      <SortCriteria></SortCriteria>
    </u:Browse>
  </s:Body>
</s:Envelope>`;

// ✅ Async error handler wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ✅ XML parser helper
const parseXml = (xmlString) => {
  try {
    return xmlParser.parse(xmlString);
   } catch (err) {
     throw new Error(`XML parse error: ${err.message}`);
   }
};

// ✅ Get metadata from audio file (chỉ lấy 10KB đầu cho metadata cơ bản)
const getAudioMetadata = async (url) => {
  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        'Range': 'bytes=0-4095' // 4KB đầu file
      },
      timeout: 5000
    });

    if (!response.ok && response.status !== 206) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    const metadata = await mm.parseBuffer(buffer, {
      mimeType: response.headers.get('content-type') || 'audio/flac',
      skipCovers: true, // Skip cover cho metadata nhanh
      duration: false,
      skipPostHeaders: true
    });

    // const filename = url.split('/').pop() || '';

    return {
      bitDepth: metadata.format.bitsPerSample || null, // number
      sampleRate: metadata.format.sampleRate || null,
      bitDepthLabel: metadata.format.bitsPerSample ? `${metadata.format.bitsPerSample}-bit` : null,
      sampleRateLabel: metadata.format.sampleRate ? `${(metadata.format.sampleRate / 1000).toFixed(1)}kHz` : null,
      
      // fileExtension: filename.split('.').pop()?.toUpperCase() || null,
      date: metadata.common.date || null,
      composer: metadata.common.composer || null,
      lyrics: metadata.common.lyrics || null
    };
  } catch (error) {
    console.warn(`Failed to get metadata for ${url}:`, error.message);
    return null;
  }
};
// Helper function để format bitrate
const formatBitrate = (bitrate) => {
  if (!bitrate) return null;
  const bitrateNum = parseInt(bitrate);
  if (isNaN(bitrateNum)) return null;

  if (bitrateNum > 1000) {
    return `${Math.round(bitrateNum / 1000)}kbps`;
  }
  return `${bitrateNum}kbps`;
};
const ensureArray = (val) => {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
};
// ✅ Transform DIDL data with metadata
const transformDIDLData = async (didl, includeMetadata = false) => {
  const containers = ensureArray(didl["DIDL-Lite"]?.container).map((c) => ({
    id: c.id,
    parentID: c.parentID,
    title: c["dc:title"],
    class: c["upnp:class"],
    childCount: c.childCount,
  }));

  const rawItems = ensureArray(didl["DIDL-Lite"]?.item).map((i) => {
    const resArr = ensureArray(i.res);
    const res = resArr[0] || {};

    return {
      id: i.id,
      title: i["dc:title"] || "Unknown",
      artist: i["upnp:artist"] || "Unknown",
      album: i["upnp:album"] || "Unknown",
      duration: res.duration || null,
      url: res["#text"],
      genre: i["upnp:genre"],
      // year: i["dc:date"] || i["upnp:originalTrackNumber"] || null,
      // trackNumber: i["upnp:originalTrackNumber"] || null,
      // protocolInfo: res.protocolInfo,
      bitrate: res.bitrate,
      // size: res.size,
      // sampleFrequency: res.sampleFrequency,
      nrAudioChannels: res.nrAudioChannels,
    };
  });

  // Nếu không cần metadata, trả về ngay
  if (!includeMetadata) {
    return { containers, items: rawItems };
  }

  // Fetch metadata cho tất cả items song song
   const CONCURRENT_LIMIT = 10;
  const items = [];
  for (let i = 0; i < rawItems.length; i += CONCURRENT_LIMIT) {
    const batch = rawItems.slice(i, i + CONCURRENT_LIMIT);
    const batchResults = await Promise.all(
      batch.map(async (item) => {
        const metadata = await getAudioMetadata(item.url);

        const out = {
          id: item.id,
        title: item.title,
        artist: item.artist,
        album: item.album,
        duration: item.duration,
        url: item.url,
        genre: item.genre,
        nrAudioChannels: item.nrAudioChannels,
        // trackNumber: item.trackNumber,
          albumArtUrl: `/api/album-art/${encodeURIComponent(item.url)}`,
        };

        if (metadata) {
          const qualityInfo = classifyAudioQuality(metadata, item.bitrate);
          out.quality = {
            encoding: qualityInfo.encoding,
            label: qualityInfo.label,
            tier: qualityInfo.tier,
            bitDepth: metadata.bitDepthLabel,
            sampleRate: metadata.sampleRateLabel,
            bitrate: formatBitrate(item.bitrate),
          };

          if (metadata.date) out.date = metadata.date;
          if (metadata.composer) out.composer = metadata.composer;
          if (metadata.lyrics) out.lyrics = metadata.lyrics;
        }

        return out;
      })
    );
    items.push(...batchResults);
  }

  return { containers, items };
};
// ✅ Get album art from audio file (lấy 2MB đầu cho album art)
const getAlbumArt = async (url) => {
  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        'Range': 'bytes=0-2097151' // 2MB đầu file
      },
      timeout: 10000
    });

    if (!response.ok && response.status !== 206) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    const metadata = await mm.parseBuffer(buffer, {
      skipCovers: false
    });

    const picture = metadata.common.picture?.[0];
    if (!picture) {
      return null;
    }

    return {
      format: picture.format,
      data: picture.data,
      description: picture.description || 'Album Art'
    };
  } catch (error) {
    console.warn(`Failed to get album art for ${url}:`, error.message);
    return null;
  }
};
// ✅ Get album art from DSD file (lấy 2MB cuối cho album art)
const getAlbumArtForDSD = async (url) => {
  try {
    // 1. HEAD để lấy file size
    const headResp = await fetchWithTimeout(url, { method: "HEAD" }, 5000);
    const fileSize = parseInt(headResp.headers.get("content-length"), 10);
    const chunkSize = 2 * 1024 * 1024;
    const start = Math.max(0, fileSize - chunkSize);
    const end = fileSize - 1;

    // 2. Fetch chunk cuối
    const response = await fetchWithTimeout(url, {
      headers: { Range: `bytes=${start}-${end}` },
    });
    if (!response.ok && response.status !== 206) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());

    // 3. Tìm "ID3"
    const id3Index = buffer.indexOf(Buffer.from("ID3"));
    if (id3Index === -1) return null;

    // 4. Đọc frame header "APIC"
    const apicIndex = buffer.indexOf(Buffer.from("APIC"), id3Index);
    if (apicIndex === -1) return null;

    let offset = apicIndex + 4;

    // Frame size (4 bytes big-endian)
    const size = buffer.readUInt32BE(offset);
    offset += 6; // skip size + flags

    // Text encoding (1 byte)
    const encoding = buffer[offset];
    offset += 1;

    // MIME type (null-terminated)
    const mimeEnd = buffer.indexOf(0x00, offset);
    const mimeType = buffer.toString("utf8", offset, mimeEnd);
    offset = mimeEnd + 1;

    // Picture type (1 byte)
    const picType = buffer[offset];
    offset += 1;

    // Description (null-terminated)
    const descEnd = buffer.indexOf(0x00, offset);
    offset = descEnd + 1;

    // 5. Data binary (the rest of frame)
    const imageBuffer = buffer.slice(offset, apicIndex + size);

    return {
      format: mimeType || "image/jpeg",
      data: imageBuffer,
      description: "Scanned Album Art",
    };
  } catch (err) {
    console.warn(`Failed to scan album art for ${url}:`, err.message);
    return null;
  }
};
// ✅ Xử lý 2 trường hợp getAlbumArt
const getAlbumArtUnified = async (url) => {
  // Method 1: Standard (metadata ở đầu file)
  const standardResult = await getAlbumArt(url);
  
  if (standardResult) {
    console.log(`Trying FLAC method for ${url}`);
    return standardResult;
  }

  // Method 2: DSD (metadata ở cuối file)  
  console.log(`Trying DSD method for ${url}`);
  const dsdResult = await getAlbumArtForDSD(url);
  return dsdResult;
};
// ✅ API endpoint để browse DLNA
app.get("/api/browse/:id", asyncHandler(async (req, res) => {
  const { id: objectId } = req.params;
  const includeMetadata = req.query.metadata === 'true';

  const response = await fetch(`${DLNA_URL}/ctl/ContentDir`, {
    method: "POST",
    headers: {
      "Content-Type": 'text/xml; charset="utf-8"',
      SOAPACTION: '"urn:schemas-upnp-org:service:ContentDirectory:1#Browse"',
    },
    body: createSoapBody(objectId),
  });

  if (!response.ok) {
    throw new Error(`DLNA server error: ${response.status}`);
  }

  const xmlText = await response.text();
  const soapResult = parseXml(xmlText);

  const rawResult = soapResult["s:Envelope"]["s:Body"]["u:BrowseResponse"].Result;
  const didlResult = parseXml(rawResult);

  const data = await transformDIDLData(didlResult, includeMetadata);
  res.json(data);
}));

// ✅ API endpoint để lấy album art
app.get("/api/album-art/:fileUrl", asyncHandler(async (req, res) => {
  const fileUrl = decodeURIComponent(req.params.fileUrl);
  const filename = fileUrl.split('/').pop() || 'unknown';

  // Check cache header
  const etag = `"${filename}-art"`;
  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end();
  }

  const albumArt = await getAlbumArtUnified(fileUrl);

  if (!albumArt) {
    return res.status(404).json({
      error: "No album art found",
      filename
    });
  }

  res.set({
    'Content-Type': albumArt.format,
    'Cache-Control': 'public, max-age=86400', // Cache 24h
    'ETag': etag
  });

  res.send(albumArt.data);
}));

// Error handler
app.use((error, req, res, next) => {
  console.error('Error:', error);
  res.status(500).json({ error: error.message });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
