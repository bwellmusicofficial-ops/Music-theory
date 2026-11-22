/** Shared corpus for the code-name FORMAT rules: tested against the TypeScript mirror and against the SQL function. Test code only. */
export const FORMAT_OK: string[] = [
  'SwiftCello42', 'Rhythm_Fox', 'rhythm-fox', 'abc', 'A1b', 'x-y-z', '12345', 'Quaver99',
  'a'.repeat(20), '1234567', 'A1234567', 'Fox1234567x', 'hotdog', 'matt', 'sat_on_it',
];
export const FORMAT_BAD: string[] = [
  '', 'ab', 'a_b', 'ab_', 'a'.repeat(21), '___', '--_', 'a b c', 'with space', 'dot.name', 'joe@x', 'ünï', 'emoji😀',
  '12345678', '1234-5678', 'ab12345678', '1_2_3_4_5_6_7_8', 'x1234567890',
  'joe_gmail', 'GMAIL_fan', 'hotmail1', 'my-outlook', 'yahoo_kid', 'icloud-1', 'protonmail', 'btinternet9', 'aol_man', 'msn-x',
  'joe_at_hello_com', 'joeatgmailcom', 'bob_at_x_co_uk'.replace('co_uk', 'couk'), 'amy-at-site-org', 'jo_at_uni_ac', 'x_at_y_edu', 'a_at_b_net',
];
