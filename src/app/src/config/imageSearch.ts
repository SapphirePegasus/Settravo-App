/**
 * src/config/imageSearch.ts
 *
 * Place-name extraction for Pixabay group image auto-fetch.
 *
 * Algorithm:
 *   1. Lowercase + tokenize the group name
 *   2. Remove STOP_WORDS (common travel/trip words, prepositions, etc.)
 *   3. Check remaining tokens against INDIA_PLACE_NAMES
 *   4. If match found → use as Pixabay query
 *   5. If no match → use the cleaned token string as freeform query
 *   6. If nothing left → fall back to "travel friends"
 *
 * The place list covers ~200 popular Indian destinations.
 * Extend this list as needed — no code change required, just add to the array.
 */

// ─── Stop words ───────────────────────────────────────────────────────────────
// Words that carry no geographic meaning and should be stripped from queries.

export const STOP_WORDS = new Set([
    // English travel words
    'trip', 'tour', 'travel', 'vacation', 'holiday', 'journey', 'adventure',
    'getaway', 'escape', 'retreat',
    // Common Hindi/Hinglish travel words
    'yatra', 'safar', 'ghumna', 'ghoomna',
    // Group naming words
    'group', 'squad', 'gang', 'crew', 'team', 'fam', 'family',
    // Prepositions / articles (English)
    'the', 'a', 'an', 'to', 'for', 'at', 'in', 'on', 'of', 'by', 'with',
    // Hindi particles
    'ke', 'ki', 'ka', 'mein', 'se', 'ko', 'pe', 'par', 'aur', 'ya',
    // Numbers / years
    '2024', '2025', '2026', '2027',
    // Symbols and punctuation that survive tokenization
    '@', '#', '!', '&',
    // Filler
    'our', 'my', 'the', 'best', 'awesome', 'epic', 'amazing',
]);

// ─── India place names ────────────────────────────────────────────────────────
// Lowercase for matching. Keep sorted by category for maintainability.

export const INDIA_PLACE_NAMES: readonly string[] = [
    // ── Metros & major cities ────────────────────────────────────────────────
    'mumbai', 'delhi', 'bangalore', 'bengaluru', 'chennai', 'kolkata',
    'hyderabad', 'pune', 'ahmedabad', 'surat', 'jaipur', 'lucknow',
    'kanpur', 'nagpur', 'patna', 'indore', 'bhopal', 'visakhapatnam',
    'vizag', 'vadodara', 'agra', 'nashik', 'faridabad', 'ghaziabad',
    'rajkot', 'meerut', 'varanasi', 'kochi', 'cochin', 'coimbatore',
    'madurai', 'amritsar', 'chandigarh', 'ranchi', 'jabalpur', 'guwahati',
    'thiruvananthapuram', 'trivandrum', 'bhubaneswar', 'dehradun',

    // ── Hill stations ────────────────────────────────────────────────────────
    'shimla', 'manali', 'darjeeling', 'ooty', 'munnar', 'mussoorie',
    'nainital', 'kasauli', 'mcleod ganj', 'mcleodganj', 'dharamshala',
    'dalhousie', 'kullu', 'chikmagalur', 'coorg', 'kodaikanal',
    'mahabaleshwar', 'panchgani', 'lonavala', 'khandala', 'matheran',
    'mount abu', 'ranikhet', 'almora', 'lansdowne', 'chakrata',
    'auli', 'chopta', 'munsiyari', 'binsar', 'kausani', 'khajjiar',
    'barog', 'chail', 'naldehra',

    // ── Beaches ──────────────────────────────────────────────────────────────
    'goa', 'pondicherry', 'puducherry', 'varkala', 'kovalam', 'puri',
    'digha', 'mandarmani', 'cherai', 'alappuzha', 'alleppey',
    'tarkarli', 'ganpatipule', 'alibaug', 'diu', 'dwarka',
    'rameswaram', 'kanyakumari', 'mahabalipuram', 'mamallapuram',
    'havelock', 'neil island', 'andaman', 'lakshadweep',
    'calangute', 'baga', 'anjuna', 'vagator', 'morjim', 'palolem',
    'agonda', 'colva', 'benaulim', 'candolim',

    // ── Heritage & cultural ──────────────────────────────────────────────────
    'jaipur', 'jodhpur', 'jaisalmer', 'udaipur', 'pushkar', 'ajmer',
    'bikaner', 'chittorgarh', 'hampi', 'badami', 'pattadakal',
    'madurai', 'mahabalipuram', 'thanjavur', 'trichy', 'tiruchirapalli',
    'mysore', 'mysuru', 'khajuraho', 'orchha', 'sanchi',
    'ajanta', 'ellora', 'aurangabad',

    // ── Religious ────────────────────────────────────────────────────────────
    'varanasi', 'haridwar', 'rishikesh', 'vrindavan', 'mathura',
    'amritsar', 'tirupati', 'shirdi', 'nashik', 'ujjain', 'dwarka',
    'somnath', 'puri', 'jagannath', 'bodh gaya', 'bodhgaya',
    'sarnath', 'leh', 'ladakh', 'spiti',

    // ── Nature & wildlife ────────────────────────────────────────────────────
    'ranthambore', 'jim corbett', 'corbett', 'kaziranga', 'sundarbans',
    'bandhavgarh', 'kanha', 'pench', 'tadoba', 'nagarhole',
    'mudumalai', 'periyar', 'bandipur', 'valley of flowers',
    'kedarnath', 'badrinath', 'gangotri', 'yamunotri',

    // ── Northeast ────────────────────────────────────────────────────────────
    'shillong', 'cherrapunji', 'kaziranga', 'majuli', 'ziro',
    'tawang', 'dirang', 'gangtok', 'pelling', 'lachung', 'nathu la',
    'nathula', 'tsomgo', 'changu', 'kohima', 'dzukou',

    // ── Himalayas & North ────────────────────────────────────────────────────
    'leh', 'ladakh', 'pangong', 'nubra', 'zanskar', 'spiti', 'kaza',
    'pin valley', 'kinnaur', 'sangla', 'chitkul', 'tirthan',
    'rohtang', 'khardungla', 'khardung la', 'chandratal',

    // ── Other popular destinations ───────────────────────────────────────────
    'agra', 'fatehpur sikri', 'jhansi', 'gwalior', 'bhopal',
    'pachmarhi', 'amarkantak', 'konark', 'chilika',
    'pondicherry', 'auroville', 'vellore', 'hampi',
] as const;

// ─── Query extractor ──────────────────────────────────────────────────────────

/**
 * Extracts a clean Pixabay search query from a group name string.
 *
 * @param groupName — raw user-typed group name
 * @returns cleaned query string, or 'travel friends' as fallback
 */
export function extractImageQuery(groupName: string): string {
    if (!groupName || !groupName.trim()) {
        return 'travel friends';
    }

    // Tokenize: lowercase, split on non-alphanumeric
    const tokens = groupName
        .toLowerCase()
        .split(/[^a-z0-9\s]+/)
        .join(' ')
        .split(/\s+/)
        .filter(Boolean);

    // Check for known place names (try multi-word first for accuracy)
    // Try 2-word combinations, then single words
    for (let len = 2; len >= 1; len--) {
        for (let i = 0; i <= tokens.length - len; i++) {
            const candidate = tokens.slice(i, i + len).join(' ');
            if (INDIA_PLACE_NAMES.includes(candidate as typeof INDIA_PLACE_NAMES[number])) {
                return candidate;
            }
        }
    }

    // Remove stop words and use what remains
    const cleaned = tokens.filter((t) => !STOP_WORDS.has(t));
    if (cleaned.length > 0) {
        // Return up to 3 tokens to keep query focused
        return cleaned.slice(0, 3).join(' ');
    }

    return 'travel friends';
}