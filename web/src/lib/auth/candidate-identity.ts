const whitespaceRegex = /\s+/g;

export function normalizeSurname(input: string): string {
  return input.trim().replace(whitespaceRegex, " ").toLowerCase();
}

export function normalizeCandidateId(input: string): string {
  return input.trim().toUpperCase();
}

export function isValidCredentialShape(candidateId: string, surname: string): boolean {
  return normalizeCandidateId(candidateId).length >= 3 && normalizeSurname(surname).length >= 2;
}
