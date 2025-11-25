import { NextResponse } from 'next/server';
import { fetchSchoolInfo } from '../../../../lib/schoolinfo.js';

/**
 * 학교 특색활동 정보 조회
 * GET /api/schoolinfo/details?schoolName=학교명
 */
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const schoolName = searchParams.get('schoolName');

    if (!schoolName || schoolName.trim() === '') {
        return NextResponse.json({
            success: false,
            message: '학교명을 입력하세요'
        }, { status: 400 });
    }

    try {
        console.log(`📚 특색활동 정보 조회: ${schoolName}`);
        const data = await fetchSchoolInfo(schoolName);

        console.log(`📊 특색활동 데이터:`, {
            programs: data.programs?.length || 0,
            programsSample: data.programs?.slice(0, 2) || []
        });

        return NextResponse.json({
            success: true,
            data
        });
    } catch (error) {
        console.error('❌ 학교 정보 조회 오류:', error);
        return NextResponse.json({
            success: false,
            message: '학교 정보 조회 실패',
            error: error.message
        }, { status: 500 });
    }
}