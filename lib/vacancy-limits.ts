/** Free of Zod so a client component can read the limits without bundling the schemas (the vacancy schema file re-exports them); drafts per author: nobody else could clean them up (D98). */
export const VACANCY_DRAFT_LIMIT = 50;
export const VACANCY_TITLE_MIN = 2;
export const VACANCY_TITLE_MAX = 200;
export const VACANCY_HEADCOUNT_MAX = 100;
export const VACANCY_REQUEST_COMMENT_MAX = 5000;
export const VACANCY_REQUEST_COMMENT_MAX_LINES = 100;
