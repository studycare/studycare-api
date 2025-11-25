import { NextResponse } from 'next/server';

export function GET() {
    return NextResponse.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        openai: !!process.env.OPENAI_API_KEY,
        port: process.env.PORT || 3000
    });
}