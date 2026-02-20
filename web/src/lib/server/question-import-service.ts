import { Buffer } from "node:buffer";

export interface ImportedQuestion {
  prompt: string;
  options: string[];
  correctOption: string;
}

export interface QuestionImportIssue {
  question: string;
  message: string;
}

export interface QuestionImportResult {
  questions: ImportedQuestion[];
  issues: QuestionImportIssue[];
}

interface QuestionDraft {
  label: string;
  promptLines: string[];
  optionsByLabel: Map<string, string>;
  answerRaw: string | null;
}

function cleanText(input: string): string {
  return input
    .replace(/\u00A0/g, " ")
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ");
}

function parseOptionLine(line: string): { label: string; text: string } | null {
  const match = line.match(/^\s*(?:\(?([A-Ha-h])\)?|([A-Ha-h]))[\).:\-]?\s+(.+)\s*$/);
  if (!match) {
    return null;
  }

  const label = (match[1] ?? match[2] ?? "").toUpperCase();
  const text = match[3]?.trim() ?? "";
  if (!label || !text) {
    return null;
  }

  return { label, text };
}

function parseAnswerLine(line: string): string | null {
  const match = line.match(/^\s*(?:answer|correct\s*answer)\s*[:\-]\s*(.+)\s*$/i);
  return match?.[1]?.trim() ?? null;
}

function parseQuestionStart(line: string): { label: string; prompt: string } | null {
  const match = line.match(/^\s*(?:q(?:uestion)?\s*)?(\d+)[\).:\-]\s*(.+)\s*$/i);
  if (!match) {
    return null;
  }

  return {
    label: match[1],
    prompt: match[2].trim(),
  };
}

function resolveCorrectOption(answerRaw: string, optionsByLabel: Map<string, string>): string | null {
  const trimmed = answerRaw.trim();
  if (!trimmed) {
    return null;
  }

  const leadingLabel =
    trimmed.match(/^\(?([A-H])\)?(?:[\).:\-\s]|$)/i)?.[1]?.toUpperCase() ??
    trimmed.match(/\boption\s*([A-H])\b/i)?.[1]?.toUpperCase() ??
    trimmed.match(/^([A-H])$/i)?.[1]?.toUpperCase();

  if (leadingLabel && optionsByLabel.has(leadingLabel)) {
    return optionsByLabel.get(leadingLabel) ?? null;
  }

  const normalizedAnswer = trimmed.toLowerCase();
  for (const optionValue of optionsByLabel.values()) {
    if (optionValue.toLowerCase() === normalizedAnswer) {
      return optionValue;
    }
  }

  return null;
}

function buildQuestionDraft(label: string): QuestionDraft {
  return {
    label,
    promptLines: [],
    optionsByLabel: new Map<string, string>(),
    answerRaw: null,
  };
}

function parseQuestionsFromText(input: string): QuestionImportResult {
  const lines = cleanText(input)
    .split("\n")
    .map((line) => line.trim());

  const questions: ImportedQuestion[] = [];
  const issues: QuestionImportIssue[] = [];
  let autoLabel = 1;
  let current: QuestionDraft | null = null;

  const finalizeCurrent = () => {
    if (!current) {
      return;
    }

    const prompt = current.promptLines.join(" ").trim().replace(/\s+/g, " ");
    const questionKey = `Q${current.label}`;
    const orderedOptions = Array.from(current.optionsByLabel.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const optionValues = orderedOptions.map((entry) => entry[1]);
    const uniqueOptionValues = new Set(optionValues.map((option) => option.toLowerCase()));

    if (!prompt) {
      issues.push({ question: questionKey, message: "Missing prompt." });
      current = null;
      return;
    }

    if (optionValues.length < 2) {
      issues.push({ question: questionKey, message: "At least two options are required." });
      current = null;
      return;
    }

    if (uniqueOptionValues.size < 2) {
      issues.push({ question: questionKey, message: "Options must not all be duplicates." });
      current = null;
      return;
    }

    if (!current.answerRaw) {
      issues.push({ question: questionKey, message: "Missing answer tag. Use 'Answer: A' or 'Correct Answer: ...'." });
      current = null;
      return;
    }

    const correctOption = resolveCorrectOption(current.answerRaw, current.optionsByLabel);
    if (!correctOption) {
      issues.push({
        question: questionKey,
        message: "Answer does not match any option. Use an option letter (A, B, C...) or exact option text.",
      });
      current = null;
      return;
    }

    questions.push({
      prompt,
      options: optionValues,
      correctOption,
    });

    current = null;
  };

  for (const line of lines) {
    if (!line) {
      continue;
    }

    const questionStart = parseQuestionStart(line);
    if (questionStart) {
      finalizeCurrent();
      current = buildQuestionDraft(questionStart.label);
      current.promptLines.push(questionStart.prompt);
      continue;
    }

    const optionLine = parseOptionLine(line);
    if (optionLine) {
      if (!current) {
        current = buildQuestionDraft(String(autoLabel));
        autoLabel += 1;
      }
      current.optionsByLabel.set(optionLine.label, optionLine.text);
      continue;
    }

    const answerRaw = parseAnswerLine(line);
    if (answerRaw) {
      if (!current) {
        current = buildQuestionDraft(String(autoLabel));
        autoLabel += 1;
      }
      current.answerRaw = answerRaw;
      continue;
    }

    if (!current) {
      current = buildQuestionDraft(String(autoLabel));
      autoLabel += 1;
    }
    current.promptLines.push(line);
  }

  finalizeCurrent();

  return {
    questions,
    issues,
  };
}

async function extractTextFromFile(file: File): Promise<string> {
  const fileName = file.name.trim().toLowerCase();
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (fileName.endsWith(".txt") || fileName.endsWith(".md")) {
    return buffer.toString("utf8");
  }

  if (fileName.endsWith(".pdf")) {
    const pdfParseModule = await import("pdf-parse");
    const parser = new pdfParseModule.PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    return result.text;
  }

  if (fileName.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (fileName.endsWith(".doc")) {
    throw new Error(".doc files are not supported. Please upload .docx or .pdf.");
  }

  throw new Error("Unsupported file type. Upload .pdf, .docx, .txt, or .md.");
}

export async function importQuestionsFromFile(file: File): Promise<QuestionImportResult> {
  const rawText = await extractTextFromFile(file);
  return parseQuestionsFromText(rawText);
}
