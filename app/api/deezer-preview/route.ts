import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const trackId = request.nextUrl.searchParams.get("id");
  if (!trackId || !/^\d{1,15}$/.test(trackId)) {
    return NextResponse.json({ error: "Invalid track ID." }, { status: 400 });
  }

  try {
    const response = await fetch(`https://api.deezer.com/track/${trackId}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: "Could not load this song preview." },
        { status: 502 },
      );
    }

    const result: unknown = await response.json();
    if (
      typeof result !== "object" ||
      result === null ||
      !("preview" in result) ||
      typeof result.preview !== "string"
    ) {
      return NextResponse.json(
        { error: "No preview is available for this song." },
        { status: 404 },
      );
    }

    const previewUrl = new URL(result.preview);
    if (
      previewUrl.protocol !== "https:" ||
      !previewUrl.hostname.endsWith(".dzcdn.net")
    ) {
      return NextResponse.json(
        { error: "The preview URL was invalid." },
        { status: 502 },
      );
    }

    return NextResponse.redirect(previewUrl, 307);
  } catch (error) {
    console.error("Could not retrieve the Deezer song preview:", error);
    return NextResponse.json(
      { error: "Could not load this song preview." },
      { status: 502 },
    );
  }
}
