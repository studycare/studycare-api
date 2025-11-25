'use client';

export default function HomePage() {
  const apiEndpoints = [
    // 시스템 API
    { path: '/api/health', method: 'GET', description: '서버 상태 확인', group: '시스템' },
    { path: '/api/config', method: 'GET', description: '클라이언트 설정 정보', group: '시스템' },

    // AI 생성 API
    { path: '/api/generate-roadmap', method: 'GET', description: 'AI 로드맵 생성 (SSE 스트리밍)', group: 'AI 생성' },
    { path: '/api/generate-section', method: 'GET', description: '개별 섹션 생성 (병렬 스트리밍)', group: 'AI 생성' },

    // 대학 정보 API
    { path: '/api/university/search', method: 'GET', description: '대학 검색 (커리어넷)', group: '대학 정보' },
    { path: '/api/university/majors', method: 'GET', description: '대학별 학과 목록', group: '대학 정보' },
    { path: '/api/university/departments/search', method: 'GET', description: '대학 학과/전공 검색', group: '대학 정보' },

    // 학교 정보 API (NEIS)
    { path: '/api/schools/search', method: 'GET', description: '학교 검색 (나이스)', group: '학교 정보' },
    { path: '/api/neis/school-info', method: 'GET', description: '학교 기본 정보', group: '학교 정보' },
    { path: '/api/neis/comprehensive', method: 'GET', description: '학교 종합 정보', group: '학교 정보' },
    { path: '/api/neis/meal', method: 'GET', description: '급식 정보', group: '학교 정보' },
    { path: '/api/neis/schedule', method: 'GET', description: '학사일정', group: '학교 정보' },
    { path: '/api/neis/majors', method: 'GET', description: '학교 학과/전공 정보', group: '학교 정보' },
    { path: '/api/neis/curriculum', method: 'GET', description: '교육과정 정보', group: '학교 정보' },

    // 기타 API
    { path: '/api/schoolinfo/details', method: 'GET', description: '학교 특색활동 정보', group: '학교 정보' }
  ];

  // 그룹별로 API 분류
  const groupedApis = apiEndpoints.reduce((acc, api) => {
    if (!acc[api.group]) {
      acc[api.group] = [];
    }
    acc[api.group].push(api);
    return acc;
  }, {});

  // 그룹별 색상
  const groupColors = {
    '시스템': '#E6FFFA',
    'AI 생성': '#FED7E2',
    '대학 정보': '#E6F6FF',
    '학교 정보': '#F0FFF4'
  };

  const groupBorderColors = {
    '시스템': '#38B2AC',
    'AI 생성': '#E53E3E',
    '대학 정보': '#3182CE',
    '학교 정보': '#48BB78'
  };

  return (
    <div style={{
      padding: '40px',
      fontFamily: 'Arial, sans-serif',
      maxWidth: '1000px',
      margin: '0 auto'
    }}>
      <h1 style={{ color: '#4A5568', marginBottom: '20px' }}>
        StudyCare API Server
      </h1>

      <div style={{
        backgroundColor: '#F7FAFC',
        padding: '20px',
        borderRadius: '8px',
        marginBottom: '30px'
      }}>
        <h2 style={{ color: '#2D3748', marginBottom: '15px' }}>
          🚀 서버 상태
        </h2>
        <p>Next.js API 서버가 정상적으로 실행 중입니다.</p>
        <p style={{ fontSize: '14px', color: '#718096' }}>
          포트: 3000 | 환경: 개발 모드 | 총 {apiEndpoints.length}개 API 엔드포인트
        </p>
      </div>

      <div style={{ marginBottom: '30px' }}>
        <h3 style={{ color: '#2D3748', marginBottom: '20px' }}>
          📡 API 엔드포인트 목록
        </h3>

        {Object.entries(groupedApis).map(([group, apis]) => (
          <div key={group} style={{ marginBottom: '25px' }}>
            <h4 style={{
              backgroundColor: groupColors[group],
              padding: '8px 12px',
              borderRadius: '4px',
              margin: '0 0 10px 0',
              borderLeft: `4px solid ${groupBorderColors[group]}`,
              fontSize: '16px',
              fontWeight: 'bold'
            }}>
              {group}
            </h4>

            {apis.map((api, index) => (
              <div key={index} style={{
                padding: '12px',
                backgroundColor: '#FFFFFF',
                marginBottom: '8px',
                borderRadius: '6px',
                border: '1px solid #E2E8F0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                transition: 'all 0.2s ease'
              }}>
                <div style={{ flex: 1 }}>
                  <span style={{
                    display: 'inline-block',
                    backgroundColor: '#CBD5E0',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    marginRight: '10px',
                    color: '#2D3748'
                  }}>
                    {api.method}
                  </span>

                  <a
                    href={api.path}
                    style={{
                      textDecoration: 'none',
                      color: '#3182CE',
                      fontWeight: 'bold',
                      fontSize: '14px'
                    }}
                  >
                    {api.path}
                  </a>

                  <span style={{
                    marginLeft: '10px',
                    fontSize: '12px',
                    color: '#718096'
                  }}>
                    - {api.description}
                  </span>
                </div>

                <div>
                  <button
                    onClick={() => window.open(api.path, '_blank')}
                    style={{
                      backgroundColor: '#4299E1',
                      color: 'white',
                      border: 'none',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      marginRight: '5px'
                    }}
                  >
                    테스트
                  </button>

                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`http://localhost:3000${api.path}`);
                      alert('API 주소가 복사되었습니다!');
                    }}
                    style={{
                      backgroundColor: '#718096',
                      color: 'white',
                      border: 'none',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    복사
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div style={{
        padding: '20px',
        backgroundColor: '#BEE3F8',
        borderRadius: '8px',
        borderLeft: '4px solid #3182CE'
      }}>
        <h3 style={{ color: '#2C5282', marginBottom: '10px' }}>
          💡 사용 방법
        </h3>
        <ul style={{ margin: '0', fontSize: '14px', color: '#2D3748', paddingLeft: '20px' }}>
          <li>클릭해서 API를 직접 테스트해보세요</li>
          <li>'복사' 버튼으로 API 주소를 클립보드에 복사할 수 있습니다</li>
          <li>프론트엔드 애플리케이션에서 이 주소로 API 요청을 보내세요</li>
          <li>파라미터가 필요한 API는 '?key=value' 형식으로 추가하세요</li>
        </ul>
      </div>
    </div>
  );
}