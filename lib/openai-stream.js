/**
 * OpenAI GPT-4o-mini 스트리밍 헬퍼 함수
 * 각 섹션별로 프롬프트를 생성하고 스트리밍으로 응답을 받습니다.
 */

import OpenAI from 'openai';
import { formatSearchResults } from './naver.js';

const getAPIKey = () => {
    if (process.env.OPENAI_API_KEY) {
        return process.env.OPENAI_API_KEY;
    }
    console.warn('⚠️ OPENAI_API_KEY 환경 변수가 설정되지 않았습니다.');
    return null;
};

const openai = new OpenAI({
    apiKey: getAPIKey()
});

function sendEvent(res, event, data) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * OpenAI 스트리밍 실행
 * @param {Response} res - HTTP 응답 객체
 * @param {string} section - 섹션 이름
 * @param {Object} studentData - 학생 데이터
 * @param {Object} schoolData - 학교 데이터
 * @param {Object} naverResults - 네이버 검색 결과
 * @param {Object} options - 옵션 (textOnly: 텍스트만 전송, careernetData: 커리어넷 데이터)
 * @returns {Promise<string>} 생성된 전체 텍스트
 */
export async function streamOpenAI(res, section, studentData, schoolData, naverResults = null, options = {}) {
    const prompt = buildPrompt(section, studentData, schoolData, naverResults, options.careernetData);

    try {
        const stream = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `당신은 대한민국 입시 전문 컨설턴트입니다. 빠르고 간결하며 핵심적인 조언을 제공합니다.

**핵심 규칙:**
- 완성된 HTML 코드로만 작성 (코드 블록 금지)
- 모든 태그에 인라인 스타일 적용
- 간결하고 실용적인 내용 (불필요한 장황함 제거)

**HTML 스타일 (핵심만):**
- h3: style="color: #1f2937; font-size: 1.4em; margin: 2em 0 1em; border-bottom: 2px solid #e5e7eb; font-weight: 700;"
- 테이블: <table style="width: 100%; border-collapse: collapse; margin: 1.5em 0;"><thead><tr style="background: linear-gradient(135deg, #6B5EFF 0%, #8B7EFF 100%); color: white;"><th style="padding: 15px;">항목</th></tr></thead><tbody><tr style="border-bottom: 1px solid #e5e7eb;"><td style="padding: 15px;">내용</td></tr></tbody></table>
- 리스트: <ul style="list-style: none; padding: 0;"><li style="margin-bottom: 0.8em; padding-left: 1.8em; position: relative;"><span style="position: absolute; left: 0; color: #6B5EFF;">•</span> 내용</li></ul>
- 강조박스: <div style="background: linear-gradient(135deg, #6B5EFF15 0%, #8B7EFF15 100%); padding: 1.5em; border-radius: 8px; border-left: 4px solid #6B5EFF;"><p style="color: #1f2937; margin: 0; font-weight: 600;">💡 내용</p></div>

**어조 규칙 (절대 준수):**
- 절대 금지: "~세요", "~해요", "~합니다", "~ㅂ니다", "화이팅", "노력하자", 모든 대화체
- 반드시 사용: "~이다", "~한다", "~된다", "필요하다", "요구된다", "분석된다"
- 예: "준비하세요" (X) → "준비한다" (O), "노력해요" (X) → "노력이 필요하다" (O)

**필수:** 테이블에 반드시 <tbody> 태그 사용. 간결하고 핵심적인 내용만 작성한다.`
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            stream: true,
            max_tokens: 4000,  // 통합 활동 로드맵 완전 출력을 위해 토큰 확장 (2500 → 4000)
            temperature: 0.4,  // 0.3 → 0.4 (약간 증가하여 속도 향상)
            stream_options: {
                include_usage: false  // 토큰 사용량 정보 제외하여 속도 향상
            }
        });

        let fullContent = '';
        const eventType = options.textOnly ? 'text' : 'chunk';

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
                fullContent += content;
                sendEvent(res, eventType, { section, text: content });
            }
        }

        // 🔧 POST-PROCESSING: 강제로 색상 및 어조 수정
        const processedContent = postProcessContent(fullContent, section);

        // 디버깅: 생성된 전체 콘텐츠 로그 (처음 200자만)
        console.log(`[${section}] 생성 완료. 길이: ${processedContent.length}자, 시작: ${processedContent.substring(0, 200)}...`);

        return processedContent;
    } catch (error) {
        console.error(`OpenAI 스트리밍 오류 (${section}):`, error);
        throw error;
    }
}

/**
 * AI 생성 콘텐츠 후처리 함수
 * - 구 색상 코드를 신 색상 코드로 강제 교체
 * - 대화체 어조 검증 및 경고
 */
function postProcessContent(content, section) {
    let processed = content;

    // 1. 색상 코드 강제 교체
    const colorReplacements = [
        { old: /#667eea/gi, new: '#6B5EFF' },
        { old: /#764ba2/gi, new: '#8B7EFF' },
        { old: /#667EEA/gi, new: '#6B5EFF' },  // 대문자 버전
        { old: /#764BA2/gi, new: '#8B7EFF' }   // 대문자 버전
    ];

    colorReplacements.forEach(({ old, new: newColor }) => {
        const beforeCount = (processed.match(old) || []).length;
        if (beforeCount > 0) {
            processed = processed.replace(old, newColor);
            console.log(`[POST-PROCESS] ${section}: ${old.source} → ${newColor} (${beforeCount}개 교체)`);
        }
    });

    // 2. 대화체 검증 (university 섹션만)
    if (section === 'university') {
        const conversationalPatterns = [
            { pattern: /~\s*세요/g, name: '~세요' },
            { pattern: /~\s*해요/g, name: '~해요' },
            { pattern: /~\s*합니다/g, name: '~합니다' },
            { pattern: /~\s*ㅂ니다/g, name: '~ㅂ니다' },
            { pattern: /화이팅/g, name: '화이팅' },
            { pattern: /노력하자/g, name: '노력하자' },
            { pattern: /해\s*보세요/g, name: '해보세요' },
            { pattern: /학생\s*이름\+야/g, name: '~야 호칭' }
        ];

        conversationalPatterns.forEach(({ pattern, name }) => {
            const matches = processed.match(pattern);
            if (matches) {
                console.warn(`⚠️ [POST-PROCESS] ${section}: 대화체 "${name}" 발견 (${matches.length}개) - AI 프롬프트 개선 필요`);
                // 예시를 로그로 출력
                const examples = processed.match(new RegExp(`.{20}${pattern.source}.{20}`, 'g'));
                if (examples) {
                    examples.slice(0, 2).forEach(ex => {
                        console.warn(`   예시: "${ex.trim()}"`);
                    });
                }
            }
        });

        // 3. 구체적인 대화체 패턴 자동 수정 시도
        const autoFixPatterns = [
            { pattern: /교사\s*조언/g, replacement: '전문가 분석' },
            { pattern: /준비하세요/g, replacement: '준비한다' },
            { pattern: /노력해요/g, replacement: '노력이 필요하다' },
            { pattern: /해\s*보세요/g, replacement: '해야 한다' }
        ];

        autoFixPatterns.forEach(({ pattern, replacement }) => {
            const beforeCount = (processed.match(pattern) || []).length;
            if (beforeCount > 0) {
                processed = processed.replace(pattern, replacement);
                console.log(`[POST-PROCESS] ${section}: "${pattern.source}" → "${replacement}" (${beforeCount}개 자동 수정)`);
            }
        });
    }

    return processed;
}

function buildPrompt(section, studentData, schoolData, naverResults, careernetData = null) {
    const builders = {
        'grade-analysis': buildGradeAnalysisPrompt,
        'admission-probability': buildAdmissionProbabilityPrompt,
        'admission-strategy': buildAdmissionStrategyPrompt,
        'grade-trend': buildGradeTrendPrompt,
        'strategy': buildStrategyPrompt,
        'roadmap': buildRoadmapPrompt,
        'university': buildUniversityPrompt,
        'books': buildBooksPrompt
    };

    // university 섹션만 careernetData 전달
    if (section === 'university') {
        return builders[section](studentData, schoolData, naverResults, careernetData);
    }

    return builders[section](studentData, schoolData, naverResults);
}

function calculateAverage(studentData) {
    const grades = [];

    // 기본 과목만 (국영수)
    if (studentData.grades.korean) grades.push(parseInt(studentData.grades.korean));
    if (studentData.grades.english) grades.push(parseInt(studentData.grades.english));
    if (studentData.grades.math) grades.push(parseInt(studentData.grades.math));

    // 추가 과목 (사용자가 입력한 과목만)
    if (studentData.grades.additional && typeof studentData.grades.additional === 'object') {
        Object.values(studentData.grades.additional).forEach(grade => {
            const gradeNum = parseInt(grade);
            if (!isNaN(gradeNum)) {
                grades.push(gradeNum);
            }
        });
    }

    // 성적이 없으면 기본값 반환
    if (grades.length === 0) return '5.0';

    return (grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(1);
}

// 1. 성적 분석 프롬프트
function buildGradeAnalysisPrompt(studentData, schoolData) {
    const avgGrade = calculateAverage(studentData);

    const subjects = [];
    // 기본 과목 (국영수만)
    if (studentData.grades.korean) subjects.push({ name: '국어', grade: studentData.grades.korean });
    if (studentData.grades.english) subjects.push({ name: '영어', grade: studentData.grades.english });
    if (studentData.grades.math) subjects.push({ name: '수학', grade: studentData.grades.math });

    // 추가 과목 (사용자가 입력한 과목만)
    if (studentData.grades.additional && typeof studentData.grades.additional === 'object') {
        Object.entries(studentData.grades.additional).forEach(([subject, grade]) => {
            if (grade) subjects.push({ name: subject, grade: grade });
        });
    }

    return `당신은 입시 전문 교사입니다. ${studentData.name} 학생(${studentData.grade}학년)의 성적을 종합 분석하여 교육적 조언을 제공한다.

**학생 정보:**
목표 대학: ${studentData.targets.university} ${studentData.targets.major}, 평균 등급: ${avgGrade}등급, 과목별 성적: ${subjects.map(s => `${s.name} ${s.grade}등급`).join(', ')}

**분석 요구사항:**
다음 3가지 주제에 대해 각각 연속된 문장으로 상세히 서술한다. 항목(불릿 포인트)을 사용하지 말고 자연스러운 문단 형태로 작성한다.

1. 전체적인 성적 수준 평가: 목표 대학 대비 현재 위치, 강점 과목과 약점 과목 분석, 과목 간 균형도 평가를 포함하여 200자 이상의 연속된 문장으로 작성한다.

2. 교과 우수성 진단: 주요 전형(교과, 종합, 정시)별 경쟁력과 내신 등급의 의미 및 개선 가능성을 150자 이상의 연속된 문장으로 작성한다.

3. 개선 방향 제시: 즉시 개선 가능한 과목, 장기적 학습 전략, 목표 달성을 위한 구체적 조언을 150자 이상의 연속된 문장으로 작성한다.

**작성 규칙:**
- 각 주제는 "1. 전체적인 성적 수준 평가:" 형식의 제목으로 시작
- 제목 뒤에 항목 없이 바로 연속된 문장으로 내용 작성
- 불릿 포인트(-, •, *) 절대 사용 금지
- 교사가 학생에게 직접 말하듯이 자연스럽고 구체적으로 작성
- 총 500자 이상의 상세한 분석`;
}

// 2. 전형별 합격 가능성 분석 프롬프트
function buildAdmissionProbabilityPrompt(studentData, schoolData) {
    const avgGrade = calculateAverage(studentData);

    return `당신은 대입 전략 컨설턴트입니다. ${studentData.name} 학생의 전형별 합격 가능성을 분석한다.

**학생 정보:**
목표: ${studentData.targets.university} ${studentData.targets.major}, 평균 등급: ${avgGrade}등급, 국어 ${studentData.grades.korean}, 영어 ${studentData.grades.english}, 수학 ${studentData.grades.math}, 비교과: 수상 ${studentData.awards ? studentData.awards.split(',').length : 0}개, 봉사 ${studentData.volunteerHours || 0}시간, 동아리 ${studentData.clubs ? studentData.clubs.split(',').length : 0}개

**분석 요구사항:**
다음 3가지 전형에 대해 각각 연속된 문장으로 상세히 서술한다. 항목(불릿 포인트)을 사용하지 말고 자연스러운 문단 형태로 작성한다.

1. 학생부교과전형 분석: 내신 등급 기반 합격 가능성, 목표 대학의 일반적 커트라인 대비 위치, 교과 전형 지원 시 유의사항을 150자 이상의 연속된 문장으로 작성한다.

2. 학생부종합전형 분석: 비교과 활동의 질과 양 평가, 전공 적합성 및 발전 가능성, 종합전형 준비 상태를 150자 이상의 연속된 문장으로 작성한다.

3. 정시 수능전형 분석: 현재 내신 성적 기반 수능 예상 성적, 정시 지원 가능 대학 범위, 수능 집중 전략의 필요성을 150자 이상의 연속된 문장으로 작성한다.

**작성 규칙:**
- 각 주제는 "1. 학생부교과전형 분석:" 형식의 제목으로 시작
- 제목 뒤에 항목 없이 바로 연속된 문장으로 내용 작성
- 불릿 포인트(-, •, *) 절대 사용 금지
- 총 450자 이상
- 희망적이면서도 현실적인 평가`;
}

// 3. 대입 전략 분석 프롬프트
function buildAdmissionStrategyPrompt(studentData, schoolData) {
    const avgGrade = calculateAverage(studentData);
    const awardsCount = studentData.awards ? studentData.awards.split(',').filter(a => a.trim()).length : 0;
    const clubsCount = studentData.clubs ? studentData.clubs.split(',').filter(c => c.trim()).length : 0;

    return `당신은 대입 전략 전문가입니다. ${studentData.name} 학생의 수시와 정시 전략을 종합 분석한다.

**학생 프로필:**
평균 등급: ${avgGrade}등급, 내신 강점: ${studentData.strongSubjects || '분석 필요'}, 비교과 활동: 총 ${awardsCount + clubsCount}개 (수상 ${awardsCount}, 동아리 ${clubsCount}), 목표: ${studentData.targets.university} ${studentData.targets.major}

**분석 요구사항:**
다음 3가지 주제에 대해 각각 연속된 문장으로 상세히 서술한다. 항목(불릿 포인트)을 사용하지 말고 자연스러운 문단 형태로 작성한다.

1. 수시 vs 정시 적합도 판단: 학생의 강점이 수시/정시 중 어디에 더 유리한지, 내신과 비교과 균형도 평가, 수능 대비 가능성 고려를 200자 이상의 연속된 문장으로 작성한다.

2. 최적 전략 제시: 수시 집중형/정시 집중형/병행형 중 추천 전략, 해당 전략의 근거와 기대 효과, 시간 배분 및 우선순위를 200자 이상의 연속된 문장으로 작성한다.

3. 실행 계획: 단계별 준비 일정, 각 전형별 준비 비중, 리스크 관리 방안을 150자 이상의 연속된 문장으로 작성한다.

**작성 규칙:**
- 각 주제는 "1. 수시 vs 정시 적합도 판단:" 형식의 제목으로 시작
- 제목 뒤에 항목 없이 바로 연속된 문장으로 내용 작성
- 불릿 포인트(-, •, *) 절대 사용 금지
- 총 550자 이상
- 데이터 기반의 객관적 분석`;
}

// 4. 성적 추이 분석 프롬프트
function buildGradeTrendPrompt(studentData, schoolData) {
    const mockExams = studentData.mockExams || [];
    const hasGrowth = mockExams.length >= 2;

    let trendInfo = '';
    if (hasGrowth && mockExams.length >= 2) {
        const first = mockExams[0];
        const last = mockExams[mockExams.length - 1];
        trendInfo = `
**성적 변화:**
- 초기(${first.date}): 국${first.korean} 영${first.english} 수${first.math}
- 최근(${last.date}): 국${last.korean} 영${last.english} 수${last.math}
- 모의고사 횟수: ${mockExams.length}회`;
    }

    return `당신은 학습 코치입니다. ${studentData.name} 학생(${studentData.grade}학년)의 성적 추이를 분석하여 학습 방향을 제시한다.

**학생 정보:**
학년: ${studentData.grade}학년, 현재 평균: ${calculateAverage(studentData)}등급${trendInfo}

**분석 요구사항:**
다음 3가지 주제에 대해 각각 연속된 문장으로 상세히 서술한다. 항목(불릿 포인트)을 사용하지 말고 자연스러운 문단 형태로 작성한다.

1. 성적 추이 해석: ${hasGrowth ? '과목별 성적 변화 패턴 분석, 상승 및 하락 과목과 그 원인, 학습 효과가 나타나는 과목' : '현재 성적 수준 분석, 과목별 학습 상태, 개선 가능성 진단'}을 포함하여 200자 이상의 연속된 문장으로 작성한다.

2. 학습 태도 평가: 성적 변화로 분석한 학습 습관, 학생의 강점과 보완점, 학습 동기 및 태도를 150자 이상의 연속된 문장으로 작성한다.

3. 향후 전망 및 조언: ${studentData.grade === '3' ? '남은 기간 최적 전략' : '다음 학년 대비 계획'}, 과목별 구체적 개선 방법, 목표 달성을 위한 로드맵을 200자 이상의 연속된 문장으로 작성한다.

**작성 규칙:**
- 각 주제는 "1. 성적 추이 해석:" 형식의 제목으로 시작
- 제목 뒤에 항목 없이 바로 연속된 문장으로 내용 작성
- 불릿 포인트(-, •, *) 절대 사용 금지
- 총 550자 이상
- 성적 변화의 의미를 깊이 있게 해석
- 학생의 성장 가능성에 초점
- 실천 가능한 구체적 조언`;
}

// SWOT 분석 프롬프트 (사용 안 함 - 주석 처리)
/*
function buildSWOTPrompt(studentData, schoolData) {
    const avgGrade = calculateAverage(studentData);

    return `${studentData.name} 학생 SWOT 분석 (${studentData.grade}학년, 평균 ${avgGrade}등급, 목표: ${studentData.targets.university} ${studentData.targets.major})

성적: 국${studentData.grades.korean} 영${studentData.grades.english} 수${studentData.grades.math}
학교: ${studentData.schoolName}

**중요: 반드시 아래 형식을 정확히 지킨다.**

### 💪 강점 (Strengths)
- [구체적 강점 1]
- [구체적 강점 2]
- [구체적 강점 3]
- [구체적 강점 4]

### 😓 약점 (Weaknesses)
- [구체적 약점 1]
- [구체적 약점 2]
- [구체적 약점 3]
- [구체적 약점 4]

### 🌟 기회 (Opportunities)
- [구체적 기회 1]
- [구체적 기회 2]
- [구체적 기회 3]
- [구체적 기회 4]

### ⚠️ 위협 (Threats)
- [구체적 위협 1]
- [구체적 위협 2]
- [구체적 위협 3]
- [구체적 위협 4]

**필수사항:**
- 각 항목은 반드시 "-" 기호로 시작
- 등급은 숫자로 명시
- 구체적이고 실행 가능한 내용`;
}
*/

// 2. 학습 전략 프롬프트 (동적 과목 + 자세한 설명) - 통합 분석 기반
function buildStrategyPrompt(studentData, schoolData, naverResults) {
    // 모든 과목 수집 (레이더 차트와 일치)
    const subjects = [];

    // 기본 과목 (국영수만)
    if (studentData.grades.korean) subjects.push({ name: '국어', grade: studentData.grades.korean });
    if (studentData.grades.english) subjects.push({ name: '영어', grade: studentData.grades.english });
    if (studentData.grades.math) subjects.push({ name: '수학', grade: studentData.grades.math });

    // 추가 과목 (사용자가 입력한 과목만)
    if (studentData.grades.additional && typeof studentData.grades.additional === 'object') {
        Object.entries(studentData.grades.additional).forEach(([subject, grade]) => {
            if (grade) subjects.push({ name: subject, grade: grade });
        });
    }

    // 평균 등급 계산
    const avgGrade = calculateAverage(studentData);

    // 과목별 시간 배분 계산
    const dailyHours = parseFloat(studentData.dailyStudyHours) || 5;
    const coreSubjects = subjects.filter(s => ['국어', '영어', '수학'].includes(s.name));
    const otherSubjects = subjects.filter(s => !['국어', '영어', '수학'].includes(s.name));

    // 국영수에 85%, 나머지 과목에 15% 배분
    const coreHoursTotal = dailyHours * 0.85;
    const otherHoursTotal = dailyHours * 0.15;

    const coreHoursEach = coreSubjects.length > 0 ? (coreHoursTotal / coreSubjects.length).toFixed(1) : 0;
    const otherHoursEach = otherSubjects.length > 0 ? (otherHoursTotal / otherSubjects.length).toFixed(1) : 0;

    // 과목별 시간 배분표
    const subjectTimeAllocation = subjects.map(s => {
        const isCore = ['국어', '영어', '수학'].includes(s.name);
        const hours = isCore ? coreHoursEach : otherHoursEach;
        return `${s.name} ${hours}시간`;
    }).join(', ');

    // 비교과 활동 정보 수집
    const awardsCount = studentData.awards ? studentData.awards.split(',').filter(a => a.trim()).length : 0;
    const volunteerHours = studentData.volunteerHours || 0;
    const readingCount = studentData.readingCount || 0;
    const clubsCount = studentData.clubs ? studentData.clubs.split(',').filter(c => c.trim()).length : 0;

    // 학교 특색 프로그램 정보
    const schoolPrograms = schoolData?.programs?.length > 0
        ? schoolData.programs.slice(0, 5).map(p => `${p.name}: ${p.description || ''}`).join(', ')
        : '정보 없음';

    // 현재 월 계산 (학기 구분)
    const currentMonth = new Date().getMonth() + 1;
    const currentGrade = parseInt(studentData.grade);

    // 테이블 행 생성
    const tableRows = subjects.map(subject => `
<tr style="border-bottom: 1px solid #e5e7eb;">
<td style="padding: 15px; font-weight: 600; color: #6B5EFF;">${subject.name}</td>
<td style="padding: 15px; text-align: center;">${subject.grade}등급</td>
<td style="padding: 15px; text-align: center;">1등급</td>
<td style="padding: 15px;">[핵심전략: 150자 이상, 학습 방향 + 비교과 연계]</td>
<td style="padding: 15px;">[월별 실행계획: 반드시 위의 div 형식 사용하여 3-4월, 5-6월, 7-8월, 9-12월로 구분]</td>
</tr>`).join('');

    return `당신은 20년 경력의 입시 전문 교사입니다. 아래 학생의 종합 분석을 바탕으로 구체적이고 실천 가능한 과목별 학습 전략을 제공한다.

**학생 종합 정보:**
- 이름: ${studentData.name} (${studentData.grade}학년)
- 학교: ${studentData.schoolName}
- 목표: ${studentData.targets.university} ${studentData.department}
- 현재 평균 등급: ${avgGrade}등급
- 과목별 성적: ${subjects.map(s => `${s.name} ${s.grade}등급`).join(', ')}

**학교 특색 프로그램:**
${schoolPrograms}

**성적 분석:**
- 최강 과목: ${subjects.reduce((min, s) => s.grade < min.grade ? s : min, subjects[0]).name} (${subjects.reduce((min, s) => s.grade < min.grade ? s : min, subjects[0]).grade}등급)
- 약점 과목: ${subjects.reduce((max, s) => s.grade > max.grade ? s : max, subjects[0]).name} (${subjects.reduce((max, s) => s.grade > max.grade ? s : max, subjects[0]).grade}등급)
- 평균 등급: ${avgGrade}등급

**비교과 활동 포트폴리오:**
- 수상 경력: ${awardsCount}개
- 봉사 시간: ${volunteerHours}시간
- 독서 권수: ${readingCount}권
- 동아리/활동: ${clubsCount}개

**현재 학습 시간 분석:**
- 일일 평균 학습 시간: ${studentData.dailyStudyHours || '미입력'}시간
- ${studentData.grade}학년 ${avgGrade <= 2 ? '상위권' : avgGrade <= 3.5 ? '중상위권' : '중위권'} 기준 권장 학습 시간: ${avgGrade <= 2 ? '6-8시간' : avgGrade <= 3.5 ? '5-7시간' : '4-6시간'} (순수 학습 시간 기준)
- 총 순공시간 목표: ${studentData.dailyStudyHours ? `일일 ${studentData.dailyStudyHours}시간 × 주 6일 = 주 ${studentData.dailyStudyHours * 6}시간, 학기당 약 ${Math.round(studentData.dailyStudyHours * 6 * 16)}시간` : '일일 5시간 × 주 6일 = 주 30시간, 학기당 약 480시간 목표'}
- 현실적 목표: ${!studentData.dailyStudyHours || studentData.dailyStudyHours < 4 ? '일일 4-5시간 확보를 목표로 점진적 증가' : studentData.dailyStudyHours < 6 ? '현재 시간 유지하면서 집중도 향상' : '현재 수준 유지, 효율성 극대화'}

**과목별 시간 배분 (일일 총 ${dailyHours}시간 기준):**
- 국영수(핵심): 총 ${coreHoursTotal.toFixed(1)}시간 (85%) → 각 과목 약 ${coreHoursEach}시간
- 기타 과목: 총 ${otherHoursTotal.toFixed(1)}시간 (15%) → 각 과목 약 ${otherHoursEach}시간
- 과목별 배분: ${subjectTimeAllocation}
- **중요**: 위 시간은 참고만 하되, 핵심전략에서는 자연스럽고 사람답게 작성할 것 (딱딱한 표현 금지, 구체적인 학습법 중심으로)

**전형별 합격 가능성 고려사항:**
- 학생부종합전형: 비교과 활동 ${awardsCount + clubsCount >= 5 ? '우수' : awardsCount + clubsCount >= 3 ? '보통' : '보완필요'} (${awardsCount + clubsCount}개 활동)
- 수시 교과전형: 평균 ${avgGrade}등급 (1-2등급 우수, 3-4등급 보통, 5등급 이하 보완필요)
- 정시 수능전형: 핵심 3과목(국영수) 평균 ${((parseInt(studentData.grades.korean) + parseInt(studentData.grades.english) + parseInt(studentData.grades.math)) / 3).toFixed(1)}등급

**대입 전략 방향:**
${avgGrade <= 2 ? '수시 교과전형 및 정시 병행 - 내신 우수, 수능 안정화 전략' :
  avgGrade <= 3.5 ? '수시 학생부종합 집중 - 비교과 강화 및 면접 대비 필수' :
  avgGrade <= 5 ? '수시 다양화 + 정시 대비 - 수능 역전 가능성 활용' :
  '정시 집중 전략 - 수능 최대 상승 집중, 재수 대비 플랜 B 준비'}

**중요: 반드시 아래 HTML 형식을 정확히 지킨다.**

<div style="background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); padding: 25px; border-radius: 12px; margin: 2em 0 1.5em 0; border-left: 5px solid #6B5EFF;">
<h4 style="color: #1f2937; font-size: 1.3em; margin: 0 0 15px 0; font-weight: 700;">📊 현재 순공시간 분석</h4>
<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-top: 15px;">
<div style="background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
<div style="color: #6B5EFF; font-weight: 600; margin-bottom: 5px;">일일 순공시간</div>
<div style="font-size: 1.8em; font-weight: 700; color: #1f2937;">${studentData.dailyStudyHours || '5'}시간</div>
</div>
<div style="background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
<div style="color: #6B5EFF; font-weight: 600; margin-bottom: 5px;">주간 순공시간</div>
<div style="font-size: 1.8em; font-weight: 700; color: #1f2937;">${studentData.dailyStudyHours ? studentData.dailyStudyHours * 6 : 30}시간</div>
<div style="font-size: 0.85em; color: #6c757d; margin-top: 5px;">주 6일 기준</div>
</div>
<div style="background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
<div style="color: #6B5EFF; font-weight: 600; margin-bottom: 5px;">학기당 순공시간</div>
<div style="font-size: 1.8em; font-weight: 700; color: #1f2937;">${studentData.dailyStudyHours ? Math.round(studentData.dailyStudyHours * 6 * 16) : 480}시간</div>
<div style="font-size: 0.85em; color: #6c757d; margin-top: 5px;">16주 기준</div>
</div>
<div style="background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
<div style="color: #6B5EFF; font-weight: 600; margin-bottom: 5px;">과목별 배분</div>
<div style="font-size: 1.1em; font-weight: 600; color: #1f2937; line-height: 1.6;">국영수 각 ${coreHoursEach}h<br>기타 각 ${otherHoursEach}h</div>
</div>
</div>
</div>

<table style="width: 100%; border-collapse: collapse; margin: 1.5em 0;">
<thead>
<tr style="background: linear-gradient(135deg, #6B5EFF 0%, #8B7EFF 100%); color: white;">
<th style="padding: 15px; text-align: left;">과목</th>
<th style="padding: 15px; text-align: center;">현재등급</th>
<th style="padding: 15px; text-align: center;">목표등급</th>
<th style="padding: 15px; text-align: left;">핵심전략</th>
<th style="padding: 15px; text-align: left;">실행계획</th>
</tr>
</thead>
<tbody>
${tableRows}
</tbody>
</table>

**작성 규칙 (매우 중요!):**
1. 핵심전략: **300-500자 분량으로 작성**, 고1~고2 학생이 바로 실천할 수 있도록 매우 구체적이고 자세하게 제시

   - **시간 배분 언급 방식**: 딱딱한 표현 금지, 자연스럽게 작성
     * ❌ 금지: "일일 총 8시간 중 세계사에 1.2시간 배정을 권장한다"
     * ❌ 금지: "이 시간량은 기타 과목 총 2.4시간 중 균등 배분한 것이다"
     * ✅ 권장: "하루 1시간 정도 공부할 것을 추천한다"
     * ✅ 권장: "매일 1시간 30분 정도 투자하여..."

   - **필수 포함 내용**: 다음을 모두 포함하여 300-500자로 작성
     * ① 하루 학습 시간과 세부 시간 배분 (개념/문제/복습 등)
     * ② 구체적인 학습 방법과 교재 활용법 (문제집 종류, 문제 개수 등)
     * ③ 취약점 보완 전략 (현재 등급에서 목표 등급으로 올리는 방법)
     * ④ 일일/주간/월간 학습 루틴
     * ⑤ 주의사항 및 팁

   - **국영수 예시 (국어)**: "매일 1시간 30분~2시간 정도 투자하여 비문학 독해 연습 40분(하루 3-4지문, EBS 수능특강 또는 자이스토리 활용), 문법 개념 정리 30분(매일 문법 개념 3개씩 완벽 암기 후 10문제 풀이), 문학 작품 분석 30분(주 3작품씩 깊이 분석, 작품별 주제·표현법·감상 포인트 정리), 나머지 20분은 그날 학습 오답 정리로 구성한다. 특히 비문학은 지문 읽기 전에 선지부터 먼저 보는 습관을 들이고, 문법은 개념 노트를 만들어 아침 등교 시간에 5분씩 복습하며, 문학은 작품별 핵심 포인트를 A4 1장으로 요약하는 연습을 한다. 주말에는 1주일치 오답을 모두 다시 풀어보고, 월말에는 모의고사 1회를 통해 실전 감각을 점검한다. 현재 등급에서 1등급으로 올리려면 특히 비문학에서 실수를 줄이는 것이 핵심이므로, 오답 분석 시 '왜 틀렸는지'를 3줄 이상 쓰는 습관을 들여야 한다."

   - **기타 과목 예시 (한국사)**: "하루 50분~1시간 학습하되 시대별 연표 정리와 암기 25분, 개념 암기 15분, 기출문제 풀이 20분으로 배분한다. 연표는 조선시대부터 시작하여 거꾸로 올라가며 손으로 직접 그려가며 흐름을 익히되, 각 시대별로 '정치·경제·사회·문화' 4개 영역을 칸으로 나눠 정리하는 방식을 추천한다. 개념 암기는 교과서 한 단원씩 읽으며 밑줄 친 부분을 암기카드에 적어 통학 시간에 외우고, 문제 풀이는 EBS 수능완성 또는 자이스토리에서 매일 20문제씩 풀되 틀린 문제는 반드시 오답 노트에 '왜 이 선지가 맞는지/틀린지' 이유를 적는다. 주말에는 평일 오답 노트를 전부 다시 풀고, 월 1회 전 범위 모의고사(30문항)를 풀어 약점 시대를 파악한다. 특히 근현대사는 연도를 정확히 외우는 것이 중요하므로 1919, 1945, 1950 같은 주요 연도는 무조건 암기하고, 전후 사건을 연결 지어 외운다."

   - "0시간 학습 중" 같은 표현 절대 사용 금지
   - 핵심전략과 실행계획이 일관성 있게 연결되도록 작성 (핵심전략에서 제시한 학습법이 실행계획에 그대로 반영되어야 함)
   - 고1~고2 학생 눈높이에 맞춰 이해하기 쉽게, 친근한 톤으로 작성

2. 실행계획: 월별로 구조화된 계획을 HTML div 태그로 작성. 각 월별 계획은 구체적인 학습 활동, 시간 배분, 비교과 연계를 포함

   **필수 형식 (정확히 준수):**
   <div style="line-height: 1.8;">
   <div style="margin-bottom: 8px; padding: 8px; background: #f9fafb; border-radius: 4px;"><strong style="color: #6B5EFF;">3-4월:</strong> [구체적 활동 + 시간] (예: 기초 개념 정리 주 3회 30분, 오답노트 작성)</div>
   <div style="margin-bottom: 8px; padding: 8px; background: #f9fafb; border-radius: 4px;"><strong style="color: #6B5EFF;">5-6월:</strong> [구체적 활동 + 시간] (예: 문제 풀이 집중 주 5회 1시간, 심화 문제집)</div>
   <div style="margin-bottom: 8px; padding: 8px; background: #f9fafb; border-radius: 4px;"><strong style="color: #6B5EFF;">7-8월:</strong> [구체적 활동 + 시간] (예: 여름방학 집중 학습 매일 2시간, 특강 참여)</div>
   <div style="padding: 8px; background: #f9fafb; border-radius: 4px;"><strong style="color: #6B5EFF;">9-12월:</strong> [구체적 활동 + 시간] (예: 실전 대비 매일 1시간, 모의고사 주 1회)</div>
   </div>

   주의: 반드시 위 HTML 형식을 정확히 사용하고, 각 월별 계획에는 구체적인 학습량과 시간을 명시한다.

3. 완전한 HTML 테이블로 작성 (코드 블록 없이)
4. <tbody> 태그 반드시 포함
5. 모든 과목 포함 (${subjects.length}개)
6. 각 전략은 성적 추이, 비교과 활동, 전형 전략을 고려하여 맞춤형으로 작성
7. 어조: "~한다", "~된다", "필요하다" 형식 사용 (대화체 금지)`;
}

// 3. AI 활동 추천 프롬프트 (사용 안 함 - 주석 처리)
/*
function buildActivitiesPrompt(studentData, schoolData, naverResults) {
    const naverText = naverResults ? `

[네이버 검색 결과]
**비교과 활동 관련:**
${formatSearchResults(naverResults.activities)}

**입시 전략 관련:**
${formatSearchResults(naverResults.strategies)}

**동아리 관련:**
${formatSearchResults(naverResults.clubs)}
` : '';

    return `학생의 성적과 목표를 바탕으로 비교과 활동을 추천하고, 각 활동의 **대학 수시지원용 자기소개서** 작성 예시를 제공해주세요.

[학생 정보]
- 이름: ${studentData.name}
- 학년: ${studentData.grade}학년
- 성적: 국어 ${studentData.grades.korean}등급, 영어 ${studentData.grades.english}등급, 수학 ${studentData.grades.math}등급
- 희망 진로: ${studentData.department}

[학교 특색]
- 학교 동아리: ${schoolData.clubs.map(c => c.name).join(', ')}
- 학교 특색 프로그램: ${schoolData.programs.map(p => p.name).join(', ')}
${naverText}
[학생 목표]
- 목표 대학: ${studentData.targets.university}
- 목표 전공: ${studentData.targets.major}
- 전형: 학생부종합전형 (수시)

마크다운 형식으로 작성:

## 🎯 우선순위별 추천 활동

| 순위 | 활동명 | 활동유형 | 중요도(%) | 시간투자 | 기대성과 | 학교활용 | 참고자료(네이버) |
|------|--------|---------|----------|---------|---------|---------|-----------------|
| 1 | ... | 동아리/대회/봉사 | 95% | 주 X시간 | ... | ${studentData.schoolName} XX동아리 | 링크 |
| 2 | ... | ... | ... | ... | ... | ... | ... |
| 3 | ... | ... | ... | ... | ... | ... | ... |
| 4 | ... | ... | ... | ... | ... | ... | ... |
| 5 | ... | ... | ... | ... | ... | ... | ... |

**중요**:
- '학교활용'에는 ${studentData.schoolName}의 실제 동아리/프로그램 명시
- '참고자료'에는 네이버 검색에서 찾은 관련 정보 링크 포함

## ✍️ 수시지원 자기소개서 작성 가이드

각 추천 활동마다 **학생부종합전형 자기소개서**에 최적화된 예시를 제공한다:

### 활동 1: [활동명]

**자소서 전략:**
- 평가요소: 학업역량 / 전공적합성 / 발전가능성 / 인성
- 이 활동으로 어필할 평가요소: [구체적 명시]
- 입학사정관 주목 포인트: [3가지]

**수시지원 자소서 샘플 (500-600자):**
\`\`\`
[지원동기 또는 계기]
저는 ${studentData.schoolName} [동아리명]에서...

[구체적 활동 내용과 노력]
특히 [구체적 프로젝트/활동]을 진행하며...

[어려움과 극복 과정]
이 과정에서 [구체적 어려움]에 직면했으나...

[배움과 성장]
이를 통해 [전공 관련 역량] 및 [인성적 성장]을...

[대학 연계 및 발전 계획]
향후 ${studentData.targets.university} ${studentData.targets.major}에서 [구체적 학업계획]...
\`\`\`

**작성 체크리스트:**
- [ ] 구체적 수치/결과 포함 (예: "3개월간 20회 실험")
- [ ] 전공 연계성 명확히 표현
- [ ] 개인의 역할과 기여도 강조
- [ ] 성찰과 성장 스토리 포함
- [ ] 대학에서의 발전 계획 연결

**피해야 할 표현:**
- 추상적 표현 (열심히, 최선, 노력 등)
- 결과만 나열
- 타인의 활동 설명

### 활동 2~5: (동일 형식으로 각 활동마다 작성)

## 📚 네이버 검색 기반 입시 전략

| 전략분야 | 추천전략 | 출처(네이버) | 실행방법 |
|---------|---------|-------------|---------|
| 학생부 관리 | ... | 블로그/카페 링크 | ... |
| 세특 작성법 | ... | ... | ... |
| 면접 준비 | ... | ... | ... |

## 📅 학년별 활동 타임라인

| 학년/학기 | 필수활동 | 권장활동 | 주의사항 |
|---------|---------|---------|---------|
| ${studentData.grade}학년 ${studentData.semester}학기 (현재) | ... | ... | ... |
| ... | ... | ... | ... |

모든 자기소개서는 ${studentData.targets.university} 학생부종합전형 평가기준에 맞춰 작성한다.`;
}
*/

// 4. 통합 활동 로드맵 프롬프트
function buildRoadmapPrompt(studentData, schoolData, naverResults) {
    // 학교 특색 프로그램 정보
    const schoolPrograms = schoolData?.programs?.length > 0
        ? schoolData.programs.slice(0, 5).map(p => `${p.name}: ${p.description || ''}`).join(', ')
        : '정보 없음';

    // 현재 평균 등급 계산
    const avgGrade = calculateAverage(studentData);

    // 과목 정보 수집 (레이더 차트와 동일한 로직)
    const subjects = [];
    if (studentData.grades.korean) subjects.push({ name: '국어', grade: studentData.grades.korean });
    if (studentData.grades.english) subjects.push({ name: '영어', grade: studentData.grades.english });
    if (studentData.grades.math) subjects.push({ name: '수학', grade: studentData.grades.math });

    // 추가 과목 (사용자가 입력한 과목만)
    if (studentData.grades.additional && typeof studentData.grades.additional === 'object') {
        Object.entries(studentData.grades.additional).forEach(([subject, grade]) => {
            if (grade) subjects.push({ name: subject, grade: grade });
        });
    }

    // 과목별 시간 배분 계산
    const dailyHours = parseFloat(studentData.dailyStudyHours) || 5;
    const coreSubjects = subjects.filter(s => ['국어', '영어', '수학'].includes(s.name));
    const otherSubjects = subjects.filter(s => !['국어', '영어', '수학'].includes(s.name));

    // 국영수에 85%, 나머지 과목에 15% 배분
    const coreHoursTotal = dailyHours * 0.85;
    const otherHoursTotal = dailyHours * 0.15;

    const coreHoursEach = coreSubjects.length > 0 ? (coreHoursTotal / coreSubjects.length).toFixed(1) : 0;
    const otherHoursEach = otherSubjects.length > 0 ? (otherHoursTotal / otherSubjects.length).toFixed(1) : 0;

    // 과목별 시간 배분표
    const subjectTimeAllocation = subjects.map(s => {
        const isCore = ['국어', '영어', '수학'].includes(s.name);
        const hours = isCore ? coreHoursEach : otherHoursEach;
        return `${s.name}: ${hours}시간`;
    }).join(', ');

    // 비교과 활동 정보 수집
    const awardsCount = studentData.awards ? studentData.awards.split(',').filter(a => a.trim()).length : 0;
    const volunteerHours = studentData.volunteerHours || 0;
    const readingCount = studentData.readingCount || 0;
    const clubsCount = studentData.clubs ? studentData.clubs.split(',').filter(c => c.trim()).length : 0;

    return `당신은 20년 경력의 고등학교 진로진학 담당 교사입니다. ${studentData.name} 학생에게 구체적이고 실행 가능한 로드맵을 제공한다. 추상적인 조언이 아닌, 실제로 오늘부터 실천할 수 있는 세부 계획을 작성한다.

**학생 종합 정보:**
- 이름: ${studentData.name} (${studentData.grade}학년)
- 학교: ${studentData.schoolName}
- 현재 성적: 평균 ${avgGrade}등급
- 과목별 성적: ${subjects.map(s => `${s.name} ${s.grade}등급`).join(', ')}
- 목표: ${studentData.targets.university} ${studentData.targets.major} (목표 등급: ${studentData.targets.grade}등급)
- 비교과: 수상 ${awardsCount}개, 봉사 ${volunteerHours}시간, 독서 ${readingCount}권, 동아리 ${clubsCount}개

**학교 정보 (실제 활용 가능한 자원):**
- 특색활동 프로그램: ${schoolData?.programs?.length > 0 ? schoolData.programs.map(p => p.name).join(', ') : '정보 없음'}
- 교육과정: ${schoolData?.curriculum?.length > 0 ? schoolData.curriculum.map(c => c.name).join(', ') : '정보 없음'}
- 학사일정: ${schoolData?.schedule?.length > 0 ? schoolData.schedule.filter((_, i) => i < 10).map(s => `${s.month}월 ${s.name}`).join(', ') : '정보 없음'}

**전형별 경쟁력 분석:**
- 학생부교과: 평균 ${avgGrade}등급 (1-2등급 우수, 3-4등급 보통, 5등급 이하 보완필요)
- 학생부종합: 비교과 ${awardsCount + clubsCount >= 5 ? '우수' : awardsCount + clubsCount >= 3 ? '보통' : '보완필요'} (총 ${awardsCount + clubsCount}개 활동)
- 정시: 핵심 3과목 평균 ${((parseInt(studentData.grades.korean) + parseInt(studentData.grades.english) + parseInt(studentData.grades.math)) / 3).toFixed(1)}등급

반드시 아래 HTML 테이블 형식을 사용하여 작성한다:

<h3 style="color: #1f2937; font-size: 1.4em; margin: 2em 0 1em; border-bottom: 2px solid #e5e7eb; font-weight: 700;">🗺️ 통합 활동 로드맵</h3>

<table style="width: 100%; border-collapse: collapse; margin: 1.5em 0;">
<thead>
<tr style="background: linear-gradient(135deg, #6B5EFF 0%, #8B7EFF 100%); color: white;">
<th style="padding: 15px; width: 15%;">활동 영역</th>
<th style="padding: 15px; width: 25%;">기간별 목표</th>
<th style="padding: 15px; width: 60%;">구체적 실행 계획 (월별 타임라인)</th>
</tr>
</thead>
<tbody>
<tr style="border-bottom: 1px solid #e5e7eb;">
<td style="padding: 15px; font-weight: 600; color: #6B5EFF; white-space: nowrap;">📚 교과&nbsp;학습<br>(${studentData.targets.grade}등급 목표)</td>
<td style="padding: 15px;">[현재 ${avgGrade}등급에서 ${studentData.targets.grade}등급 달성을 위한 단계별 목표를 250자 이상으로 작성. 예: "현재 ${avgGrade}등급에서 ${studentData.targets.grade}등급으로 상승하려면 ${Math.abs(parseFloat(avgGrade) - parseFloat(studentData.targets.grade)).toFixed(1)}등급 상승이 필요하다. 1학기 중간고사까지 2.5등급, 기말고사까지 2.0등급, 2학기 중간고사에 ${studentData.targets.grade}등급 달성을 목표로 한다. 약점 과목을 집중 보완하고 강점 과목은 1등급 유지에 초점을..."]</td>
<td style="padding: 15px;">
${subjects.map((s, idx) => {
  const isCore = ['국어', '영어', '수학'].includes(s.name);
  const coreHours = parseFloat(studentData.dailyStudyHours || 5) * 0.85 / 3;
  const otherHours = parseFloat(studentData.dailyStudyHours || 5) * 0.15 / Math.max(subjects.length - 3, 1);
  const studyHours = isCore ? coreHours.toFixed(1) : otherHours.toFixed(1);

  return `<p style="margin: 8px 0; line-height: 1.6;"><strong style="color: #6B5EFF;">${s.name} (${s.grade}등급 → ${isCore ? Math.max(1, s.grade - 1) : Math.max(2, s.grade - 0.5)}등급, 하루 ${studyHours}h):</strong><br>• 3-4월: ${isCore ? '교과서 2회독, 기본 문제집 100문제 (개념 완벽 이해)' : '핵심 개념 정리, 기출 50문제 분석'}<br>• 5-6월: ${isCore ? '심화 문제집 150문제, 오답 정리 (약점 집중 보완)' : '기출 70문제 완벽 분석'}<br>• 7-8월: ${isCore ? '특강 수강, 실전 모의고사 주 2회' : '개념 총정리, 모의고사 5회'}<br>• 9-12월: ${isCore ? '모의고사 주 3회, 최종 점검' : '기출 반복 학습, 모의고사 주 2회'}</p>`;
}).join('')}

**주의사항:**
- 위 예시는 기본 가이드이며, AI는 각 과목의 현재 등급(${subjects.map(s => `${s.name} ${s.grade}등급`).join(', ')})을 고려하여 더 구체적이고 단계적인 월별 전략을 생성해야 합니다.
- 각 월별로 구체적인 학습량(문제집 페이지, 모의고사 횟수 등)을 명시하고, 학생이 실제로 실행 가능한 계획을 작성합니다.
- 상세 설명 부분에 각 기간별 구체적인 활동과 목표 수치를 명시합니다.
</td>
</tr>
<tr style="border-bottom: 1px solid #e5e7eb;">
<td style="padding: 15px; font-weight: 600; color: #6B5EFF; white-space: nowrap;">🎯 비교과&nbsp;활동<br>(전공 연계)</td>
<td style="padding: 15px;">[${studentData.department} 전공을 위한 비교과 활동 목표를 250자 이상으로 작성. 현재 수상 ${awardsCount}개, 동아리 ${clubsCount}개를 고려하여, 예: "현재 비교과 활동이 ${awardsCount + clubsCount < 3 ? '부족한 상황이므로' : awardsCount + clubsCount >= 5 ? '우수하므로 심화에 집중하여' : '보통 수준이므로 추가로'} 1학기에는 ${studentData.department} 관련 동아리 활동 주도적 참여 및 프로젝트 1건 완성, 2학기에는 대회 입상 1건 이상, 방학에는 전공 관련 심화 탐구 및 봉사활동 ${Math.max(30 - volunteerHours, 0)}시간 추가 확보를 목표로 한다. 단순 참여가 아닌 주도적 기획과 실행을..."]</td>
<td style="padding: 15px;">
<p style="margin: 8px 0; line-height: 1.6;">• 3월: ${studentData.department} 관련 동아리 가입 신청${schoolData?.programs?.length > 0 ? `, '${schoolData.programs[0]?.name}' 프로그램 신청` : ', 전공 관련 교내 동아리 탐색'}, 전공 관련 도서 2권 독서 시작<br>• 4-5월: ${schoolData?.programs?.length > 0 ? `${schoolData.programs[0]?.name} 프로그램` : '동아리'} 프로젝트 기획, 전공 관련 독서 3권 + 독서록 작성, 교내 발표 준비<br>• 6월: 교내 행사 참여, 동아리 프로젝트 중간 발표, 봉사활동 시작 (월 10시간)<br>• 7-8월: ${studentData.department} 관련 온라인 강좌 수강, 전공 서적 심화 독서 5권, 봉사활동 20-30시간, 심화 탐구 보고서 15페이지 작성<br>• 9-11월: 동아리 활동 주도적 역할, 교내 학술제/발표대회 참가, 탐구 보고서 교과 발표 및 세특 기록 요청, 교외 대회 준비<br>• 12월: 1년간 활동 정리 및 포트폴리오 작성, 생기부 기록 최종 점검, 다음 학년 계획 수립</p>

**주의사항:**
- 위 예시는 참고용이며, 반드시 학교 정보(${schoolData?.programs?.length || 0}개 프로그램, ${schoolData?.curriculum?.length || 0}개 교육과정, ${schoolData?.schedule?.length || 0}개 학사일정)를 최대한 활용하여 더 구체적이고 체계적인 월별 실행계획을 작성할 것
- 학교 정보가 풍부하면 구체적 프로그램명과 일정을 명시하고, 정보가 부족하면 일반적이지만 실행 가능한 활동 중심으로 작성
- 각 월별로 구체적인 실행 항목, 예상 소요 시간, 결과물을 명확히 제시
</td>
</tr>
<tr style="border-bottom: 1px solid #e5e7eb;">
<td style="padding: 15px; font-weight: 600; color: #6B5EFF; white-space: nowrap;">📝 생활기록부<br>(세특 관리)</td>
<td style="padding: 15px;">[생기부 전략적 관리 목표를 250자 이상으로 작성. 예: "학생부종합전형의 핵심인 세부능력 및 특기사항(세특)에서 ${studentData.department} 전공 적합성을 명확히 드러내는 것이 목표이다. 각 과목마다 학기당 최소 1회 이상 심화 활동을 진행하고 이를 세특에 기록되도록 하며, 특히 전공 관련 과목에서는 심화 탐구 보고서를 작성하여 학업 역량과 탐구 능력을 입증한다. 교과 간 융합 활동을 통해 종합적 사고력도..."]</td>
<td style="padding: 15px;">
[과목별 세특 전략을 작성한다.
**중요: 반드시 학생의 실제 과목(${subjects.map(s => s.name).join(', ')})만 포함하며, 학교 정보(교육과정, 특색활동)를 기반으로 현실적이고 실행 가능한 전략만 제시한다.**
- 학교에 관련 교육과정이나 프로그램이 실제로 있다면 반드시 그 프로그램명을 명시할 것
- 학교 정보가 없는 경우에만 일반적이지만 실행 가능한 세특 전략 제시
- 추상적 표현 금지: "심화 탐구", "전공 관련 활동" 같은 모호한 표현 대신 구체적 활동명 사용
각 과목별로 다음 형식으로 작성:]

${subjects.map(s => {
    const relatedCurriculum = schoolData?.curriculum?.find(c => c.name.includes(s.name));
    const curriculumText = relatedCurriculum
        ? `${studentData.schoolName} '${relatedCurriculum.name}' 수업 시간에`
        : `${s.name} 수업 시간에`;
    const programText = schoolData?.programs?.length > 0
        ? `${schoolData.programs[0]?.name} 프로그램 활동과 연계하여`
        : '동아리 활동과 연계하여';

    return `<p style="margin: 8px 0; line-height: 1.6;"><strong style="color: #6B5EFF;">${s.name}:</strong> 1학기 ${curriculumText} ${studentData.department} 관련 심화 발표 (주제: 구체적으로 명시), ${programText} ${studentData.department} 탐구 활동 기록, 전공 관련 독서 및 토론 활동, 2학기 ${curriculumText} 프로젝트 수행 및 보고서 작성 (15-20페이지), 교과 선생님께 세특 기록 요청 (활동 증빙 자료 제출)</p>`;
}).join('')}

**주의사항:**
- 위 예시는 참고용이며, 학교 교육과정 정보(${schoolData?.curriculum?.length || 0}개)와 특색활동 정보(${schoolData?.programs?.length || 0}개)를 최대한 활용하여 더 구체적이고 체계적인 과목별/월별 세특 전략을 작성할 것
- 반드시 학생이 입력한 과목(${subjects.map(s => s.name).join(', ')})만 포함
- 학교에 실제로 있는 교육과정이나 프로그램이 있다면 그 명칭을 정확히 명시하여 현실성 높일 것
- 각 과목별로 학기당 2-3개의 구체적인 세특 기록 활동 계획 제시
</td>
</tr>
<tr>
<td style="padding: 15px; font-weight: 600; color: #6B5EFF; white-space: nowrap;">🎤 면접&nbsp;준비<br>(3학년 필수)</td>
<td style="padding: 15px;">[학생부종합전형 면접 준비 목표를 250자 이상으로 작성. 예: "${studentData.grade}학년은 ${studentData.grade === '3' ? '면접 준비가 매우 급박하므로 즉시 시작해야 한다' : '면접까지 시간이 있으므로 체계적으로 준비할 수 있다'}. 생활기록부 전체를 완벽히 숙지하고 각 활동의 동기, 과정, 결과, 배운 점을 명확히 설명할 수 있도록 하며, 특히 ${studentData.department} 전공에 대한 깊이 있는 이해와 열정을 드러낼 수 있어야 한다. 예상 질문 100개 이상 준비하고 답변을 1분, 2분, 3분 버전으로 각각 작성하여..."]</td>
<td style="padding: 15px;">
<p style="margin: 8px 0; line-height: 1.6;">• 3개월 전 (기초 다지기): 생기부 전체 3회 정독, 활동별 키워드 엑셀 정리, 예상 질문 50개 작성, ${studentData.department} 관련 최신 이슈 10개 조사<br>• 2개월 전 (심화 준비): 예상 질문 100개로 확대 + STAR 기법으로 답변 구조화, 모의 면접 주 2회 실시, 전공 서적 추가 2권 정독, 지원 대학별 면접 기출 문제 분석 (최근 3년)<br>• 1개월 전 (실전 대비): 답변 1분/2분/3분 버전 각각 준비 및 암기, 모의 면접 주 3-4회 (녹화 후 피드백 분석), 압박 면접 대비 연습 5회 이상, 최신 시사 이슈 정리 (주요 뉴스 5개/주)<br>• 1주일 전 (최종 점검): 생기부 핵심 내용 최종 암기 (각 활동별 3분 설명 가능), 면접 복장 및 태도 점검, 최종 모의 면접 매일 1회, 전공 관련 핵심 키워드 30개 완벽 암기</p>
</td>
</tr>
</tbody>
</table>

**중요 (필수 준수사항):**
- 모든 계획은 오늘부터 실행 가능한 구체적 내용으로 작성 (추상적 표현 금지)
- 각 월별로 구체적인 실행 항목, 예상 소요 시간, 결과물을 명확히 제시
- ${studentData.schoolName}에서 실제로 활용 가능한 프로그램과 자원을 최대한 반영
- 학생의 현재 수준(평균 ${avgGrade}등급, 비교과 ${awardsCount + clubsCount}개)을 고려한 현실적 계획
- 모든 활동은 ${studentData.targets.university} ${studentData.targets.major} 입학에 직접 도움이 되는 방향으로 설계
- 타임라인 형식으로 시각적으로 이쁘고 체계적으로 작성하여 학생이 한눈에 파악할 수 있도록 할 것`;
}

// 5. 대학 추천 프롬프트
function buildUniversityPrompt(studentData, schoolData, naverResults, careernetData = null) {
    const avgGrade = calculateAverage(studentData);

    // 비교과 활동 정보 수집
    const awardsCount = studentData.awards ? studentData.awards.split(',').filter(a => a.trim()).length : 0;
    const volunteerHours = studentData.volunteerHours || 0;
    const readingCount = studentData.readingCount || 0;
    const clubsCount = studentData.clubs ? studentData.clubs.split(',').filter(c => c.trim()).length : 0;

    // 학교 정보 (학교알리미 API 데이터)
    const schoolInfo = schoolData ? `
**학교 정보 (학교알리미 데이터):**
- 학교명: ${studentData.schoolName}
- 학교 특색: ${schoolData.programs?.slice(0, 3).map(p => p.name).join(', ') || '정보 없음'}
- 동아리: ${schoolData.clubs?.slice(0, 5).map(c => c.name).join(', ') || '정보 없음'}
` : '';

    // 커리어넷 API 데이터
    const careernetInfo = careernetData ? `
**커리어넷 진로정보 데이터:**
- 목표 대학: ${careernetData.university?.schoolName || studentData.targets.university}
- 대학 설립: ${careernetData.university?.estType || '정보 없음'}
- 대학 지역: ${careernetData.university?.region || '정보 없음'}
- 전공명: ${careernetData.major?.mClass || studentData.targets.major}
- 전공 계열: ${careernetData.major?.lClass || '정보 없음'}
${careernetData.majorDetail ? `
- 전공 취업률: ${careernetData.majorDetail.jobs || '정보 없음'}
- 졸업생 평균 연봉: ${careernetData.majorDetail.salary || '정보 없음'}
- 관련 직업: ${careernetData.majorDetail.job || '정보 없음'}
- 개설 대학 수: ${careernetData.majorDetail.univ || '정보 없음'}
` : ''}
- 관련 대학 목록: ${careernetData.universities?.slice(0, 5).map(u => u.schoolName).join(', ') || '정보 없음'}
- 유사 전공: ${careernetData.majors?.slice(0, 3).map(m => m.mClass).join(', ') || '정보 없음'}
` : '';

    // 대학알리미 API2 추천 데이터 (52,214개 학과 기반)
    const recommendationInfo = careernetData?.recommendations ? `
**대학알리미 API 기반 추천 대학 (전국 52,214개 학과 분석):**
- 분석된 관련 학과 총 개수: ${careernetData.recommendations.totalCount || 0}개
- 상향 도전 추천: ${careernetData.recommendations.recommendations?.challenge?.slice(0, 3).join(', ') || '분석 중'}
- 적정 수준 추천: ${careernetData.recommendations.recommendations?.suitable?.slice(0, 3).join(', ') || '분석 중'}
- 안정 지원 추천: ${careernetData.recommendations.recommendations?.safe?.slice(0, 3).join(', ') || '분석 중'}
- 관련 학과 예시 (상위 10개):
${careernetData.recommendations.majorsList?.slice(0, 10).map((m, idx) =>
    `  ${idx + 1}. ${m.university} - ${m.major} (${m.field})`
).join('\n') || '  정보 없음'}
` : '';

    // 목표 대학 리스트 정리 (최대 3개)
    const targetUniversitiesText = studentData.targets.universities && studentData.targets.universities.length > 0
        ? studentData.targets.universities.slice(0, 3).map((u, idx) => `${idx + 1}. ${u.name} ${u.major || ''}`).join(', ')
        : `${studentData.targets.university} ${studentData.targets.major}`;

    return `**🚨 중요: 아래 규칙을 절대적으로 준수할 것:**
1. 모든 문장을 객관적 서술형("~이다", "~한다", "~된다", "필요하다")으로 작성
2. 대화체("~세요", "~해요", "○○야", "너는") 절대 금지 - 발견 시 전체 거부 (반드시 "~한다", "~된다" 형태 사용)
3. 테이블 헤더 색상: 반드시 #6B5EFF 0%, #8B7EFF 100% 사용 (#667eea 금지)
4. 실제 대학명/전공명만 사용 (추상적 표현 금지)
5. 대학알리미 API 데이터를 활용하여 실제 입시 결과와 학과 정보를 기반으로 현실적인 전략 제공

당신은 대입 전문 컨설턴트이다. ${studentData.name} 학생의 성적과 비교과 활동을 종합 분석하여 현실적이고 구체적인 대학 추천과 입시 전략을 제공한다.

<h3 style="color: #1f2937; font-size: 1.4em; margin: 2em 0 1em; border-bottom: 2px solid #e5e7eb; font-weight: 700;">📋 학생 입력 정보 요약</h3>

<table style="width: 100%; border-collapse: collapse; margin: 1.5em 0; background: #f9fafb;">
<thead>
<tr style="background: linear-gradient(135deg, #6B5EFF 0%, #8B7EFF 100%); color: white;">
<th style="padding: 15px; width: 20%; text-align: left;">항목</th>
<th style="padding: 15px; width: 80%; text-align: left;">내용</th>
</tr>
</thead>
<tbody>
<tr style="border-bottom: 1px solid #e5e7eb;">
<td style="padding: 15px; font-weight: 600; color: #6B5EFF; background: #f3f4f6;">현재 재학 중인 학교</td>
<td style="padding: 15px;">${studentData.schoolName}</td>
</tr>
<tr style="border-bottom: 1px solid #e5e7eb;">
<td style="padding: 15px; font-weight: 600; color: #6B5EFF; background: #f3f4f6;">희망 학과/전공</td>
<td style="padding: 15px;">${studentData.department}</td>
</tr>
<tr style="border-bottom: 1px solid #e5e7eb;">
<td style="padding: 15px; font-weight: 600; color: #6B5EFF; background: #f3f4f6;">목표 대학 수준</td>
<td style="padding: 15px;">${studentData.targets.university}</td>
</tr>
<tr style="border-bottom: 1px solid #e5e7eb;">
<td style="padding: 15px; font-weight: 600; color: #6B5EFF; background: #f3f4f6;">구체적 목표 대학·전공</td>
<td style="padding: 15px;">${targetUniversitiesText}</td>
</tr>
<tr style="border-bottom: 1px solid #e5e7eb;">
<td style="padding: 15px; font-weight: 600; color: #6B5EFF; background: #f3f4f6;">현재 평균 등급</td>
<td style="padding: 15px;">${avgGrade}등급 (국${studentData.grades.korean} 영${studentData.grades.english} 수${studentData.grades.math})</td>
</tr>
<tr>
<td style="padding: 15px; font-weight: 600; color: #6B5EFF; background: #f3f4f6;">비교과 활동</td>
<td style="padding: 15px;">수상 ${awardsCount}개, 봉사 ${volunteerHours}시간, 독서 ${readingCount}권, 동아리 ${clubsCount}개</td>
</tr>
</tbody>
</table>

**학생 종합 프로필:**
- 이름: ${studentData.name} (${studentData.grade}학년)
- 현재 성적: 평균 ${avgGrade}등급 (국${studentData.grades.korean} 영${studentData.grades.english} 수${studentData.grades.math})
- 목표: ${studentData.targets.university} ${studentData.targets.major} (목표 등급: ${studentData.targets.grade}등급)
- 비교과: 수상 ${awardsCount}개, 봉사 ${volunteerHours}시간, 독서 ${readingCount}권, 동아리 ${clubsCount}개
${schoolInfo}
${careernetInfo}
${recommendationInfo}
**전형별 경쟁력:**
- 학생부교과: 평균 ${avgGrade}등급 (1-2등급 우수, 3-4등급 보통, 5등급 이하 보완필요)
- 학생부종합: 비교과 ${awardsCount + clubsCount >= 5 ? '우수' : awardsCount + clubsCount >= 3 ? '보통' : '보완필요'} (총 ${awardsCount + clubsCount}개 활동)
- 정시: 핵심 3과목 평균 ${((parseInt(studentData.grades.korean) + parseInt(studentData.grades.english) + parseInt(studentData.grades.math)) / 3).toFixed(1)}등급

**🎯 작성 형식 (정확히 따를 것):**
아래 HTML을 정확히 복사하되, 대괄호[] 안의 내용만 실제 내용으로 대체한다. 색상 코드는 절대 변경하지 않는다.

<h3 style="color: #1f2937; font-size: 1.4em; margin: 2em 0 1em; border-bottom: 2px solid #e5e7eb; font-weight: 700;">🎓 목표 대학 vs 추천 대학 비교</h3>

<table style="width: 100%; border-collapse: collapse; margin: 1.5em 0;">
<thead>
<tr style="background: linear-gradient(135deg, #6B5EFF 0%, #8B7EFF 100%); color: white;">
<th style="padding: 15px; width: 10%;">구분</th>
<th style="padding: 15px; width: 15%;">대학명</th>
<th style="padding: 15px; width: 15%;">전공</th>
<th style="padding: 15px; width: 60%;">입시전략 분석</th>
</tr>
</thead>
<tbody>
<tr style="border-bottom: 1px solid #e5e7eb;">
<td style="padding: 15px; font-weight: 600; color: #6B5EFF;">목표</td>
<td style="padding: 15px;">${studentData.targets.university}</td>
<td style="padding: 15px;">${studentData.targets.major}</td>
<td style="padding: 15px;">[600자 이상으로 상세히 분석. 객관적 서술형 필수. 예: "${studentData.targets.university} ${studentData.targets.major}는 최근 3년간 입시 경쟁률이 평균 15:1 수준이다. 학생부종합전형의 경우 내신 ${(parseFloat(avgGrade) - 0.5).toFixed(1)}등급 이상, 비교과 활동 10개 이상의 지원자가 주를 이룬다. 현재 평균 ${avgGrade}등급, 비교과 ${awardsCount + clubsCount}개인 상황에서는 ${avgGrade <= 2.5 ? '내신 경쟁력이 우수하므로 학생부교과전형을 주력으로 하되' : avgGrade <= 4.0 ? '학생부종합전형에서 비교과 활동의 질적 우수성을 부각시키는 것이' : '정시 수능전형에 집중하여 역전 전략을 추구하는 것이'} 유리하다. ${studentData.department} 분야에서 심화 탐구 활동 경험과 전공 적합성을 드러내는 포트폴리오 구축이 필수적이다. 최근 입시 동향을 보면 단순 활동 개수보다는 활동의 깊이와 전공 연계성이 중요하게 평가되고 있으며, 면접에서는 생활기록부 기반 심층 질문이 주를 이루므로 각 활동에 대한 명확한 동기, 과정, 결과, 배움을 정리해야 한다."]</td>
</tr>
<tr style="border-bottom: 1px solid #e5e7eb;">
<td style="padding: 15px; font-weight: 600; color: #6B5EFF;">추천1<br>(상향)</td>
<td style="padding: 15px;">[반드시 실제 대학명 사용. 예: 성균관대학교, 한양대학교, 중앙대학교, 경희대학교, 한국외국어대학교, 서울시립대학교, 건국대학교, 동국대학교, 홍익대학교 등]</td>
<td style="padding: 15px;">[반드시 구체적 전공명 사용. 예: 컴퓨터공학과, 경영학과, 전자전기공학부, 간호학과, 기계공학과, 화학공학과, 의예과, 약학과, 건축학과 등]</td>
<td style="padding: 15px;">[커리어넷 데이터와 실제 입시 결과를 기반으로 600자 이상 분석. 절대 대화체("~세요", "~해요") 사용 금지. 반드시 객관적 서술형("~이다", "~한다", "~필요하다", "~요구된다")만 사용. 예: "성균관대학교 컴퓨터공학과 학생부종합전형은 최근 3년 평균 내신 1.8등급, 비교과 활동 15개 이상의 합격자가 다수를 차지한다. 현재 ${avgGrade}등급에서 합격하려면 0.7등급 상승과 비교과 활동 ${Math.max(15 - (awardsCount + clubsCount), 0)}개 추가 확보가 요구된다. 특히 소프트웨어 관련 대회 입상 2건 이상, 심화 프로젝트 3건 이상이 경쟁력 있는 지원자의 평균 수준이다. 이 대학은 학업 역량 60%, 전공 적합성 25%, 발전 가능성 15% 비율로 평가하므로 내신 관리가 최우선이며, 코딩 경험과 알고리즘 역량을 드러내는 포트폴리오 구축이 필수적이다. 자기소개서는 구체적 프로젝트 경험과 기술 성장 과정을 중심으로 작성하되 단순 나열이 아닌 문제 해결 역량과 창의성을 강조한다."]</td>
</tr>
<tr style="border-bottom: 1px solid #e5e7eb;">
<td style="padding: 15px; font-weight: 600; color: #6B5EFF;">추천2<br>(적정)</td>
<td style="padding: 15px;">[반드시 실제 대학명 사용. 예: 인하대학교, 아주대학교, 부산대학교, 전남대학교, 충남대학교, 가톨릭대학교, 숭실대학교, 세종대학교, 광운대학교 등]</td>
<td style="padding: 15px;">[반드시 구체적 전공명 사용]</td>
<td style="padding: 15px;">[합격 가능성과 전략을 600자 이상 객관적 서술형으로 분석. 대화체 절대 금지. 예: "인하대학교 기계공학과는 현재 ${avgGrade}등급 수준에서 합격 가능성이 높은 적정 지원 대학이다. 최근 3년 입시 결과를 분석하면 내신 ${avgGrade}등급대에서 학생부종합전형으로 35% 이상 합격하였으며, 전공 관련 활동의 진정성과 일관성을 핵심적으로 평가한다. 평가 요소는 학업 역량 45%, 전공 적합성 30%, 발전 가능성 15%, 인성 10%로 구성되므로 비교과 활동에서 기계공학 분야에 대한 지속적 관심과 실험/제작 경험을 명확히 드러내는 것이 중요하다. 특히 로봇 제작, 3D 모델링, CAD 설계 등 실질적 경험이 있으면 강점이 된다. 자기소개서는 기계공학 선택 동기를 구체적 경험과 연결하여 서술하되 고교 3년간 일관된 탐구 과정을 시간순으로 제시한다. 면접은 생활기록부 기반 질문이 주를 이루므로 모든 활동을 3분 이내로 설명할 수 있도록 준비한다."]</td>
</tr>
<tr>
<td style="padding: 15px; font-weight: 600; color: #6B5EFF;">추천3<br>(안정)</td>
<td style="padding: 15px;">[반드시 실제 대학명 사용. 예: 단국대학교, 명지대학교, 상명대학교, 국민대학교, 한성대학교, 서울과학기술대학교, 한국항공대학교, 경기대학교 등]</td>
<td style="padding: 15px;">[반드시 구체적 전공명 사용]</td>
<td style="padding: 15px;">[안정 지원 전략과 대학 강점을 600자 이상 객관적으로 분석. 대화체 절대 금지. 예: "수시 6장 중 최소 2장은 안정권 대학 지원이 필수적이다. 국민대학교 경영학과는 ${avgGrade}등급으로 안정적 합격이 가능하며(최근 3년 평균 합격률 65%), 경영학 분야에서 산학협력 프로그램과 취업률 88% 이상의 실질적 강점을 보유한다. 특히 빅데이터 경영 트랙과 스타트업 인큐베이팅 프로그램이 우수하여 재학 중 실무 경험을 쌓을 기회가 풍부하고, 학과 내 경영 시뮬레이션과 기업 연계 프로젝트가 체계적으로 운영된다. 입시 전략은 학생부교과전형 60%와 학생부종합전형 40%를 병행하되 현재 내신 성적으로는 교과전형이 더 유리하므로 남은 학기 내신 집중 관리가 효과적이다. 안정권이지만 경영학 교육 품질과 산업체 네트워크가 우수하여 취업 경쟁력이 높으므로 전략적으로 가치 있는 선택이다."]</td>
</tr>
</tbody>
</table>

<h3 style="color: #1f2937; font-size: 1.4em; margin: 2em 0 1em; border-bottom: 2px solid #e5e7eb; font-weight: 700;">📊 전형별 합격 전략</h3>

<table style="width: 100%; border-collapse: collapse; margin: 1.5em 0;">
<thead>
<tr style="background: linear-gradient(135deg, #6B5EFF 0%, #8B7EFF 100%); color: white;">
<th style="padding: 15px; width: 15%;">전형명</th>
<th style="padding: 15px; width: 20%;">추천대학</th>
<th style="padding: 15px; width: 50%;">전략적 준비 방안</th>
<th style="padding: 15px; width: 15%;">우선순위</th>
</tr>
</thead>
<tbody>
<tr style="border-bottom: 1px solid #e5e7eb;">
<td style="padding: 15px; font-weight: 600; color: #6B5EFF;">학생부종합</td>
<td style="padding: 15px;">${studentData.targets.university} 외 ${avgGrade <= 3.0 ? '3-4' : avgGrade <= 4.5 ? '4-5' : '5-6'}개 대학</td>
<td style="padding: 15px;">[학생부종합전형의 평가 요소와 준비 전략을 500자 이상으로 구체적으로 분석. 예: "학생부종합전형은 학업 역량, 전공 적합성, 발전 가능성, 인성을 종합 평가하는 전형이다. 현재 평균 ${avgGrade}등급, 비교과 ${awardsCount + clubsCount}개인 경우 ${awardsCount + clubsCount >= 5 ? '비교과 활동의 양적 기반은 갖추어져 있으므로 질적 심화에 집중해야 한다' : '추가 활동 확보와 함께 기존 활동의 심화가 필요하다'}. 세부능력특기사항(세특)은 각 과목에서 최소 학기당 1회 이상 ${studentData.department} 관련 탐구 활동을 기록하고, 독서는 전공 관련 서적 위주로 학기당 3-5권 이상 확보해야 한다. 자기소개서는 지원 동기, 노력 과정, 배움과 성장을 일관된 서사로 연결하되, 추상적 표현보다는 구체적 사례와 수치를 활용해야 한다. 면접 대비는 생활기록부 전체를 최소 3회 이상 정독하며, 각 활동에 대해 '동기-과정-결과-배움'을 3분 이내로 설명할 수 있도록 준비한다."]</td>
<td style="padding: 15px; text-align: center;">${avgGrade <= 4.0 ? '1순위' : '2순위'}</td>
</tr>
<tr>
<td style="padding: 15px; font-weight: 600; color: #6B5EFF;">학생부교과</td>
<td style="padding: 15px;">[내신 ${avgGrade}등급 수준의 구체적 대학 2-3개]</td>
<td style="padding: 15px;">[학생부교과전형의 특징과 현실적 전략을 500자 이상으로 분석. 예: "학생부교과전형은 내신 성적이 평가의 90% 이상을 차지하는 전형이다. 현재 ${avgGrade}등급은 ${avgGrade <= 2.0 ? '상위권 대학 교과전형에서 충분히 경쟁력이 있으며' : avgGrade <= 3.5 ? '중위권 대학 교과전형에서 합격 가능성이 있으나' : '교과전형보다는 종합전형이나 정시에 집중하는 것이'} 전략적으로 ${avgGrade <= 3.5 ? '유리하다' : '효과적이다'}. 남은 학기 내신 관리 전략은 ${avgGrade <= 3.0 ? '현재 등급 유지 및 소폭 상승을 목표로 하되, 약점 과목 집중 보완을 통해 평균 0.2-0.3등급 상승을 목표로 한다' : '전략 과목을 선정하여 집중 관리하며, 1-2개 과목에서라도 1등급대 성적을 확보하여 전공 적합성을 드러낸다'}. 교과전형의 경우 면접이나 서류 평가 비중이 낮아 준비 부담은 적지만, 성적이 합격을 거의 결정하므로 시험 3주 전부터 집중 관리 체계를 구축해야 한다."]</td>
<td style="padding: 15px; text-align: center;">${avgGrade <= 3.0 ? '1순위' : '3순위'}</td>
</tr>
</tbody>
</table>

<h3 style="color: #1f2937; font-size: 1.4em; margin: 2em 0 1em; border-bottom: 2px solid #e5e7eb; font-weight: 700;">💡 수시 지원 전략 (6장 활용)</h3>

<table style="width: 100%; border-collapse: collapse; margin: 1.5em 0;">
<thead>
<tr style="background: linear-gradient(135deg, #6B5EFF 0%, #8B7EFF 100%); color: white;">
<th style="padding: 15px; width: 8%;">순서</th>
<th style="padding: 15px; width: 18%;">대학</th>
<th style="padding: 15px; width: 18%;">전공</th>
<th style="padding: 15px; width: 12%;">전형</th>
<th style="padding: 15px; width: 44%;">전략적 분석</th>
</tr>
</thead>
<tbody>
<tr style="border-bottom: 1px solid #e5e7eb;">
<td style="padding: 15px; text-align: center; font-weight: 600;">1번</td>
<td style="padding: 15px;">[최상위 상향 대학 구체명]</td>
<td style="padding: 15px;">[구체적 전공명]</td>
<td style="padding: 15px;">학생부종합</td>
<td style="padding: 15px;">[1번 지원의 전략적 근거를 400자 이상으로 분석. 예: "1번 카드는 최상위 도전으로, 현재 성적보다 1등급 이상 높은 수준이지만 학생부종합전형의 정성 평가 특성상 비교과 활동 우수성과 전공 적합성으로 역전이 가능하다. 이 대학은 최근 3년 입시에서 내신 ${parseFloat(avgGrade) + 0.5}등급이지만 전공 관련 전국 대회 수상, 심화 연구 경험이 있는 지원자의 합격 사례가 있으므로, 남은 기간 전공 관련 대회 입상과 연구 활동에 집중하는 전략이 필요하다. 전공 적합성을 최우선 평가 요소로 보므로 ${studentData.department} 분야의 깊이 있는 탐구 경험과 명확한 학업 계획을 드러내야 한다."]</td>
</tr>
<tr style="border-bottom: 1px solid #e5e7eb;">
<td style="padding: 15px; text-align: center; font-weight: 600;">2번</td>
<td style="padding: 15px;">[상향 대학 구체명]</td>
<td style="padding: 15px;">[구체적 전공명]</td>
<td style="padding: 15px;">학생부종합</td>
<td style="padding: 15px;">[2번 지원의 현실적 합격 가능성과 준비 전략을 400자 이상으로 분석]</td>
</tr>
<tr style="border-bottom: 1px solid #e5e7eb;">
<td style="padding: 15px; text-align: center; font-weight: 600;">3번</td>
<td style="padding: 15px;">[적정 대학 구체명]</td>
<td style="padding: 15px;">[구체적 전공명]</td>
<td style="padding: 15px;">${avgGrade <= 3.0 ? '학생부교과' : '학생부종합'}</td>
<td style="padding: 15px;">[3번 지원의 합격 확률과 전략적 의미를 400자 이상으로 분석]</td>
</tr>
<tr style="border-bottom: 1px solid #e5e7eb;">
<td style="padding: 15px; text-align: center; font-weight: 600;">4번</td>
<td style="padding: 15px;">[적정 대학 구체명]</td>
<td style="padding: 15px;">[구체적 전공명]</td>
<td style="padding: 15px;">${avgGrade <= 3.0 ? '학생부교과' : '학생부종합'}</td>
<td style="padding: 15px;">[4번 지원의 안정성 확보 전략을 400자 이상으로 분석]</td>
</tr>
<tr style="border-bottom: 1px solid #e5e7eb;">
<td style="padding: 15px; text-align: center; font-weight: 600;">5번</td>
<td style="padding: 15px;">[안정 대학 구체명]</td>
<td style="padding: 15px;">[구체적 전공명]</td>
<td style="padding: 15px;">학생부교과</td>
<td style="padding: 15px;">[5번 안정권 지원의 중요성과 대학의 강점을 400자 이상으로 분석]</td>
</tr>
<tr>
<td style="padding: 15px; text-align: center; font-weight: 600;">6번</td>
<td style="padding: 15px;">[최하위 안정 대학 구체명]</td>
<td style="padding: 15px;">[구체적 전공명]</td>
<td style="padding: 15px;">학생부교과</td>
<td style="padding: 15px;">[6번 최종 안전망으로서의 전략적 가치를 400자 이상으로 분석]</td>
</tr>
</tbody>
</table>

**중요 (필수 준수사항 - 위반 시 전체 응답 거부):**

**1. 대화체 완전 금지 (최우선 규칙):**
- 절대 금지 표현: "~세요", "~해요", "~합니다", "~ㅂ니다", "~라고요", "~네요", "~어요", "~지요"
- 절대 금지 표현: "화이팅", "노력하자", "힘내자", "해봐", "해보자", "○○야", "너는", "당신은", "여러분"
- 절대 금지 표현: "~하시", "~하셔", "~께서", 모든 높임말
- 반드시 사용: "~이다", "~한다", "~된다", "필요하다", "요구된다", "분석된다", "평가된다"
- 검증 방법: 작성한 모든 문장에서 "~세요", "~해요" 검색 → 하나라도 발견 시 전체 재작성

**2. 실제 대학명/전공명 필수 (추상적 표현 금지):**
- ❌ 금지: "[상향 대학]", "[적정 대학]", "[안정 대학]", "[구체적 대학명]", "[전공명]"
- ✅ 필수: "성균관대학교", "한양대학교", "인하대학교", "컴퓨터공학과", "경영학과" 등 실제 명칭
- 커리어넷 제공 대학 목록 우선 활용: ${careernetData?.universities?.slice(0, 5).map(u => u.schoolName).join(', ') || '없음'}
- 최소 3개 이상의 서로 다른 구체적 대학명 반드시 포함

**3. 커리어넷 데이터 필수 활용:**
${careernetData ? `
- 전공 취업률: ${careernetData.majorDetail?.jobs || '정보 없음'} → 반드시 전략 분석에 언급
- 평균 연봉: ${careernetData.majorDetail?.salary || '정보 없음'} → 반드시 전략 분석에 언급
- 관련 직업: ${careernetData.majorDetail?.job || '정보 없음'} → 진로 연계 설명 필수
- 유사 전공: ${careernetData.majors?.slice(0, 3).map(m => m.mClass).join(', ') || '정보 없음'} → 대안 전공 제시 시 활용
` : '- 커리어넷 데이터 없음 → 일반적인 대학/전공 정보로 대체'}

**4. 객관적 수치 기반 분석:**
- 현재 성적: 평균 ${avgGrade}등급
- 비교과 활동: ${awardsCount + clubsCount}개
- 상향 지원: ${(parseFloat(avgGrade) - 0.9).toFixed(1)}등급 이상 대학
- 적정 지원: ${(parseFloat(avgGrade) - 0.3).toFixed(1)}-${(parseFloat(avgGrade) + 0.3).toFixed(1)}등급 대학
- 안정 지원: ${(parseFloat(avgGrade) + 0.7).toFixed(1)}등급 이하 대학
- 모든 전략에 구체적 숫자(등급, 개수, 비율, %) 반드시 포함

**5. 작성 분량:**
- 목표 대학 분석: 최소 500자
- 추천 대학 각각: 최소 400자
- 전형별 준비 방안: 최소 400자
- 수시 6장 각 카드: 최소 300자

**6. 수시지원전략 테이블 전형 컬럼 규칙 (매우 중요):**
- **전형 컬럼**: 오직 전형 유형명만 기재 (예: "학생부종합", "학생부교과", "논술", "실기")
- **절대 금지**: 전형 컬럼에 분석 내용, 설명, 전략 등 긴 텍스트 기재 금지
- **분석 내용**: 모든 분석과 전략은 반드시 "전략적 분석" 컬럼에만 작성
- **전형 정보 없을 때**: 전형을 모르거나 확실하지 않으면 "-" 또는 빈 칸으로 남겨둘 것
- **예시 (올바른 형식):**
  - 전형 컬럼: "학생부종합" | 전략적 분석 컬럼: "이 대학은 학업 역량 60%, 전공 적합성 25%로 평가하므로..."
  - 전형 컬럼: "-" | 전략적 분석 컬럼: "학생부교과전형 또는 학생부종합전형 중 유리한 전형 선택 가능하며..."
- **예시 (잘못된 형식 - 절대 금지):**
  - 전형 컬럼: "학생부종합전형은 학업 역량 60%로 평가하며..." ❌

**7. 최종 검증 체크리스트:**
□ 모든 대학명이 실제 대학명인가?
□ 모든 전공명이 구체적인가?
□ "~세요", "~해요" 표현이 단 한 곳도 없는가?
□ 커리어넷 데이터(취업률/연봉)를 언급했는가?
□ 모든 전략에 구체적 숫자가 포함되었는가?
□ 수시지원전략 테이블의 전형 컬럼에 전형명만 있고 분석 내용은 없는가?`;
}

// 6. 도서 추천 프롬프트
function buildBooksPrompt(studentData, schoolData, naverResults) {
    return `학생의 목표와 성적을 바탕으로 맞는 도서를 추천해주세요.

[학생 정보]
- 이름: ${studentData.name}
- 학년: ${studentData.grade}학년
- 성적: 국어 ${studentData.grades.korean}등급, 영어 ${studentData.grades.english}등급, 수학 ${studentData.grades.math}등급
- 희망 진로: ${studentData.department}

[추가 정보]
- 목표 전공: ${studentData.targets.major}
- 학년: ${studentData.grade}학년

마크다운 형식으로 작성하되, 반드시 테이블을 사용한다:

## 📚 맞춤 도서 추천

| 분야 | 도서명 | 저자 | 추천이유 | 읽는방법 | 활용전략 |
|------|--------|------|---------|---------|---------|
| 전공 심화 | ... | ... | [200자 이상: 왜 이 학생에게 필요한지] | [읽는 순서, 중점사항] | [세특/자소서 연계 방법] |
| 약점 보완 | ... | ... | ... | ... | ... |
| 인문 소양 | ... | ... | ... | ... | ... |
| 논술/면접 | ... | ... | ... | ... | ... |
| 진로 탐색 | ... | ... | ... | ... | ... |

**중요**:
- 각 도서는 ${studentData.name} 학생의 상황과 직접 연결
- '활용전략'에 생활기록부/자소서 작성법 포함
- 최소 10권 이상 추천

## 📖 독서 로드맵

| 학년/학기 | 필독서 | 권장독서량 | 기록방법 |
|---------|--------|-----------|---------|
| ${studentData.grade}학년 ${studentData.semester}학기 (현재) | [도서명 3권] | 월 2권 | 독서록 작성 → 세특 연계 |
| ... | ... | ... | ... |

## ✍️ 독서 활동 → 생기부 연계 전략

각 추천 도서를 어떻게 생활기록부에 기록할지 예시:

**예시 1: [첫 번째 추천 도서명]**
- 읽은 후 할 활동: [탐구보고서/토론/프로젝트]
- 세특 기록 예시: "[과목] 시간에 '[도서명]'을 읽고 [탐구주제]에 대해 심화 탐구함. [구체적 내용과 결과]"
- 자소서 연계: [이 책에서 얻은 인사이트를 자소서에 어떻게 녹일지]

**예시 2~3: (동일 형식)**

모든 도서는 ${studentData.targets.major} 전공과 연계되어야 하며, ${studentData.schoolName} 도서관에서 구할 수 있는지 확인한다.`;
}
