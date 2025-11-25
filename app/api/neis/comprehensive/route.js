import { NextResponse } from 'next/server';
import { getComprehensiveSchoolInfo } from '../../../../lib/neis.js';

/**
 * 학교 종합 정보 조회 (나이스 API)
 * GET /api/neis/comprehensive?schoolName=학교명
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
        const data = await getComprehensiveSchoolInfo(schoolName);

        if (data.error) {
            return NextResponse.json({
                success: false,
                message: data.error
            }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            data
        });
    } catch (error) {
        console.error('나이스 API 오류:', error);
        return NextResponse.json({
            success: false,
            message: '학교 정보 조회 실패',
            error: error.message
        }, { status: 500 });
    }
}