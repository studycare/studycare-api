import { NextResponse } from 'next/server';
import { getSchoolInfo } from '../../../../lib/neis.js';

/**
 * 학교 기본 정보 조회 (나이스 API)
 * GET /api/neis/school-info?schoolName=학교명
 */
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const schoolName = searchParams.get('schoolName');

    if (!schoolName) {
        return NextResponse.json({
            success: false,
            message: '학교명을 입력하세요'
        }, { status: 400 });
    }

    try {
        const data = await getSchoolInfo(schoolName);

        if (!data) {
            return NextResponse.json({
                success: false,
                message: '학교를 찾을 수 없습니다'
            }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            data
        });
    } catch (error) {
        console.error('학교 정보 조회 오류:', error);
        return NextResponse.json({
            success: false,
            message: '학교 정보 조회 실패',
            error: error.message
        }, { status: 500 });
    }
}