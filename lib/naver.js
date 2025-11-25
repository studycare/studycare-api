/**
 * 네이버 검색 API 헬퍼 함수
 *
 * 비교과 활동, 입시 전략, 동아리 관련 정보를 검색합니다.
 */

/**
 * 네이버 블로그 검색
 * @param {string} query1 - 첫 번째 검색어 (예: 전공명)
 * @param {string} query2 - 두 번째 검색어 (예: 대학명)
 * @returns {Promise<{activities: Array, strategies: Array, clubs: Array}>}
 */
export async function searchNaver(query1, query2) {
    const CLIENT_ID = process.env.NAVER_CLIENT_ID;
    const CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;

    if (!CLIENT_ID || !CLIENT_SECRET) {
        console.error('네이버 API 키가 설정되지 않았습니다.');
        return { activities: [], strategies: [], clubs: [] };
    }

    // 검색 쿼리 구성
    const queries = [
        `${query1} 비교과활동 추천`,
        `${query2} 학생부종합전형 전략`,
        `${query1} 관련 동아리`
    ];

    try {
        const results = await Promise.all(
            queries.map(query =>
                searchNaverBlog(query, CLIENT_ID, CLIENT_SECRET)
            )
        );

        return {
            activities: results[0],
            strategies: results[1],
            clubs: results[2]
        };
    } catch (error) {
        console.error('네이버 API 오류:', error);
        return { activities: [], strategies: [], clubs: [] };
    }
}

/**
 * 네이버 블로그 검색 API 호출
 * @param {string} query - 검색어
 * @param {string} clientId - 네이버 클라이언트 ID
 * @param {string} clientSecret - 네이버 클라이언트 시크릿
 * @returns {Promise<Array>}
 */
async function searchNaverBlog(query, clientId, clientSecret) {
    try {
        const response = await fetch(
            `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(query)}&display=5&sort=sim`,
            {
                method: 'GET',
                headers: {
                    'X-Naver-Client-Id': clientId,
                    'X-Naver-Client-Secret': clientSecret
                }
            }
        );

        if (!response.ok) {
            throw new Error(`네이버 API 오류: ${response.status}`);
        }

        const data = await response.json();

        if (!data.items || data.items.length === 0) {
            console.warn(`검색 결과 없음: ${query}`);
            return [];
        }

        return data.items.map(item => ({
            title: stripHTML(item.title),
            link: item.link,
            description: stripHTML(item.description),
            bloggername: item.bloggername,
            postdate: item.postdate
        }));
    } catch (error) {
        console.error(`네이버 블로그 검색 실패 (${query}):`, error.message);
        return [];
    }
}

/**
 * HTML 태그 제거
 * @param {string} html - HTML 문자열
 * @returns {string} 순수 텍스트
 */
function stripHTML(html) {
    if (!html) return '';
    return html
        .replace(/<\/?b>/g, '') // <b> 태그 제거
        .replace(/<[^>]*>/g, '') // 모든 HTML 태그 제거
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();
}

/**
 * 검색 결과를 마크다운 링크 형식으로 변환
 * @param {Array} results - 검색 결과 배열
 * @returns {string} 마크다운 형식의 문자열
 */
export function formatSearchResults(results) {
    if (!results || results.length === 0) {
        return '검색 결과가 없습니다.';
    }

    return results.map((item, index) =>
        `${index + 1}. [${item.title}](${item.link})\n   ${item.description}`
    ).join('\n\n');
}
