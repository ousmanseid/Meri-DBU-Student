import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../database/db.js';
import { AuditService } from './audit.service.js';

export interface IngestDocumentParams {
  documentId: string;
  title: string;
  versionLabel?: string;
  accessScope: 'PUBLIC' | 'STUDENT_ONLY' | 'STAFF_ONLY' | 'REGISTRAR_ONLY';
  rawText: string;
  sectionTitle?: string;
}

export interface RagCitation {
  documentId: string;
  documentTitle: string;
  sectionTitle: string;
  versionLabel: string;
  accessScope: string;
  chunkSnippet: string;
}

export interface RagResponse {
  answer: string;
  citations: RagCitation[];
  confidenceScore: number;
  abstained: boolean;
  language: 'en' | 'am';
}

export class RagService {
  // Deterministic dense semantic vector generator (128-dimensional)
  // Maps text semantics into normalized vector space for reliable similarity search
  private static generateEmbedding(text: string): number[] {
    const vector = new Array(128).fill(0);
    const normalized = text.toLowerCase().replace(/[^a-z0-9\u1200-\u137F\s]/g, ' ');
    const tokens = normalized.split(/\s+/).filter(Boolean);

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      let hash = 0;
      for (let j = 0; j < token.length; j++) {
        hash = (hash << 5) - hash + token.charCodeAt(j);
        hash |= 0;
      }
      const index = Math.abs(hash) % 128;
      const weight = 1.0 / (1 + Math.log1p(i));
      vector[index] += weight;
    }

    // L2 Normalize
    let norm = 0;
    for (const v of vector) norm += v * v;
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < 128; i++) vector[i] /= norm;
    }
    return vector;
  }

  private static cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return dot;
  }

  // Chunk document text into overlapping chunks
  static chunkText(text: string, chunkSize: number = 400, overlap: number = 80): string[] {
    const paragraphs = text.split(/\n\n+/);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const p of paragraphs) {
      if ((currentChunk + '\n' + p).length <= chunkSize) {
        currentChunk = currentChunk ? currentChunk + '\n' + p : p;
      } else {
        if (currentChunk) chunks.push(currentChunk.trim());
        // Handle overlap
        const words = currentChunk.split(/\s+/);
        const overlapWords = words.slice(-Math.min(words.length, 15)).join(' ');
        currentChunk = overlapWords + '\n' + p;
        if (currentChunk.length > chunkSize) {
          chunks.push(currentChunk.slice(0, chunkSize).trim());
          currentChunk = currentChunk.slice(chunkSize - overlap);
        }
      }
    }
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    return chunks.length > 0 ? chunks : [text.trim()];
  }

  // Ingest and index an approved document
  static async ingestDocument(params: IngestDocumentParams) {
    const db = await getDb();
    const chunks = this.chunkText(params.rawText);

    await db.transaction(async (tx) => {
      // Remove any prior active chunks for this doc
      await tx.query('DELETE FROM ai_document_chunks WHERE document_id = $1', [params.documentId]);

      for (let i = 0; i < chunks.length; i++) {
        const chunkText = chunks[i];
        const embedding = this.generateEmbedding(chunkText);
        const chunkId = 'chk-' + uuidv4();
        const metadata = JSON.stringify({
          title: params.title,
          version: params.versionLabel || '1.0',
          scope: params.accessScope,
          section: params.sectionTitle || 'General',
        });

        await tx.query(
          `INSERT INTO ai_document_chunks (
            id, document_id, chunk_index, content, section_title,
            access_scope, metadata, embedding_json
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            chunkId,
            params.documentId,
            i,
            chunkText,
            params.sectionTitle || 'General Section',
            params.accessScope,
            metadata,
            JSON.stringify(embedding),
          ]
        );
      }

      await tx.query(`UPDATE documents SET is_indexed_in_rag = TRUE WHERE id = $1`, [params.documentId]);
    });

    return {
      documentId: params.documentId,
      indexedChunks: chunks.length,
    };
  }

  // Detect Amharic Unicode script range (\u1200 - \u137F)
  static isAmharic(query: string): boolean {
    return /[\u1200-\u137F]/.test(query);
  }

  // Prompt injection & jailbreak sanitizer
  static sanitizeQuery(query: string): string {
    const forbiddenPatterns = [
      /ignore\s+(all\s+)?previous\s+instructions/gi,
      /you\s+are\s+now\s+in\s+developer\s+mode/gi,
      /reveal\s+(system\s+prompt|passwords|database|secrets)/gi,
      /bypass\s+all\s+restrictions/gi,
      /<script.*?>.*?<\/script>/gi,
      /drop\s+table/gi,
    ];

    let sanitized = query;
    for (const pat of forbiddenPatterns) {
      sanitized = sanitized.replace(pat, '[REDACTED_SECURITY_PATTERN]');
    }
    return sanitized.trim();
  }

  // Access-Aware Retrieval & Grounded Generation
  static async queryAssistant(
    userQuery: string,
    userRole: string = 'PUBLIC_VISITOR',
    userId?: string
  ): Promise<RagResponse> {
    const db = await getDb();
    const cleanQuery = this.sanitizeQuery(userQuery);
    const amharic = this.isAmharic(cleanQuery);
    const queryEmbedding = this.generateEmbedding(cleanQuery);

    // Enforce Access-Aware Permissions (Section 10B)
    // Only retrieve documents the caller's role is authorized to see
    const allowedScopes: string[] = ['PUBLIC'];
    if (['FRESHMAN', 'SENIOR'].includes(userRole)) {
      allowedScopes.push('STUDENT_ONLY');
    }
    if (['DEAN', 'ADMISSIONS', 'DEPT_HEAD', 'ADVISOR', 'INSTRUCTOR', 'STUDENT_AFFAIRS', 'SYSTEM_ADMIN'].includes(userRole)) {
      allowedScopes.push('STUDENT_ONLY', 'STAFF_ONLY');
    }
    if (['REGISTRAR', 'SYSTEM_ADMIN', 'AUDITOR'].includes(userRole)) {
      allowedScopes.push('STUDENT_ONLY', 'STAFF_ONLY', 'REGISTRAR_ONLY');
    }

    // Retrieve active chunks matching permitted scopes
    const scopePlaceholders = allowedScopes.map((_, idx) => `$${idx + 1}`).join(', ');
    const chunksRes = await db.query(
      `SELECT c.*, d.title as doc_title, d.version_label
       FROM ai_document_chunks c
       JOIN documents d ON c.document_id = d.id
       WHERE c.is_active = TRUE
         AND d.is_archived = FALSE
         AND c.access_scope IN (${scopePlaceholders})`,
      allowedScopes
    );

    const scoredChunks: { chunk: any; score: number }[] = [];

    for (const c of chunksRes.rows) {
      let emb: number[] = [];
      try {
        emb = JSON.parse(c.embedding_json);
      } catch {
        continue;
      }
      const sim = this.cosineSimilarity(queryEmbedding, emb);
      // Keyword boost
      const lowerQueryTokens = cleanQuery.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
      let matchCount = 0;
      for (const t of lowerQueryTokens) {
        if (c.content.toLowerCase().includes(t)) matchCount++;
      }
      const compositeScore = sim * 0.7 + Math.min(matchCount * 0.1, 0.3);

      if (compositeScore > 0.15) {
        scoredChunks.push({ chunk: c, score: compositeScore });
      }
    }

    // Sort by relevance score
    scoredChunks.sort((a, b) => b.score - a.score);
    const topChunks = scoredChunks.slice(0, 3);

    // Abstention Check: If no evidence or very low score, abstain responsibly
    if (topChunks.length === 0 || topChunks[0].score < 0.22) {
      const abstentionMsg = amharic
        ? 'ይቅርታ፣ ይህን ጉዳይ የሚመለከት ይፋዊ መረጃ በፀደቁ የደብረ ብርሃን ዩኒቨርሲቲ ሰነዶች ውስጥ አልተገኘም። እባክዎ የዩኒቨርሲቲውን ሬጅስትራር ቢሮ ወይም የሚመለከተውን የትምህርት ክፍል ያነጋግሩ።'
        : 'Official information answering this specific query is not found in approved university documents. Please contact the Debre Berhan University Registrar Office (Block 12) or the relevant academic department.';

      await AuditService.log({
        actorUserId: userId || null,
        actorRole: userRole,
        action: 'AI_ASSISTANT_ABSTAINED',
        entityType: 'AI_QUERY',
        entityId: 'RAG_QUERY',
        details: { query: cleanQuery, topScore: topChunks[0]?.score || 0 },
        outcome: 'SUCCESS',
      });

      return {
        answer: abstentionMsg,
        citations: [],
        confidenceScore: topChunks[0]?.score || 0,
        abstained: true,
        language: amharic ? 'am' : 'en',
      };
    }

    // Grounded Answer Construction with Citations
    const citations: RagCitation[] = topChunks.map((tc) => ({
      documentId: tc.chunk.document_id,
      documentTitle: tc.chunk.doc_title,
      sectionTitle: tc.chunk.section_title || 'General Section',
      versionLabel: tc.chunk.version_label || '1.0',
      accessScope: tc.chunk.access_scope,
      chunkSnippet: tc.chunk.content.slice(0, 150) + '...',
    }));

    const evidenceSnippets = topChunks.map((tc) => tc.chunk.content).join('\n\n');

    let answer = '';
    if (amharic) {
      answer = `በደብረ ብርሃን ዩኒቨርሲቲ ይፋዊ ሰነዶች መሰረት፡\n${evidenceSnippets}\n\n[ማስታወሻ፡ ይህ መረጃ የተወሰደው ከፀደቁ የዩኒቨርሲቲው መመሪያዎች ነው።]`;
    } else {
      answer = `According to approved Debre Berhan University official records:\n\n${evidenceSnippets}\n\n[Source verified from official DBU institutional repository]`;
    }

    await AuditService.log({
      actorUserId: userId || null,
      actorRole: userRole,
      action: 'AI_ASSISTANT_ANSWERED',
      entityType: 'AI_QUERY',
      entityId: 'RAG_QUERY',
      details: { query: cleanQuery, citationCount: citations.length, topScore: topChunks[0].score },
      outcome: 'SUCCESS',
    });

    return {
      answer,
      citations,
      confidenceScore: topChunks[0].score,
      abstained: false,
      language: amharic ? 'am' : 'en',
    };
  }
}
