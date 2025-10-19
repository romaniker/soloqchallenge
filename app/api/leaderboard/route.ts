import { NextResponse } from "next/server";

type Region = { regional: string; platform: string; opgg: string };
const ROUTES: Record<string, Region> = {
  EUW: { regional: "europe",   platform: "euw1", opgg: "euw" },
  EUNE:{ regional: "europe",   platform: "eun1", opgg: "eune" },
  NA:  { regional: "americas", platform: "na1",  opgg: "na"  },
  LAN: { regional: "americas", platform: "la1",  opgg: "lan" },
  LAS: { regional: "americas", platform: "la2",  opgg: "las" },
  BR:  { regional: "americas", platform: "br1",  opgg: "br"  },
  TR:  { regional: "europe",   platform: "tr1",  opgg: "tr"  },
  JP:  { regional: "asia",     platform: "jp1",  opgg: "jp"  },
  KR:  { regional: "asia",     platform: "kr",   opgg: "kr"  },
  OCE: { regional: "sea",      platform: "oc1",  opgg: "oce" },
};

type AccountDto = { puuid: string; gameName: string; tagLine: string };
type SummonerDto = { id?: string; profileIconId: number };
type LeagueEntry = { queueType: string; tier: string; rank: string; leaguePoints: number };
type MatchParticipant = { puuid: string; win: boolean };
type MatchDto = { info?: { participants?: MatchParticipant[] } };

const MATCH_COUNT = 10;

function cap(s: string) { return s ? s[0] + s.slice(1).toLowerCase() : s; }
function headers() { return { "X-Riot-Token": process.env.RIOT_API_KEY || "" }; }

async function riot<T>(url: string, where: string): Promise<T> {
  const res = await fetch(url, { headers: headers(), cache: "no-store" });
  const text = await res.text();
  if (!res.ok) throw new Error(`${where} → Riot ${res.status}: ${text}`);
  return JSON.parse(text) as T;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    // MODO PRUEBA: /api/leaderboard?debug=1
    if (url.searchParams.get("debug") === "1") {
      return NextResponse.json([{
        id: "test",
        rank: 1,
        avatarUrl: "https://ddragon.leagueoflegends.com/cdn/14.20.1/img/profileicon/588.png",
        gameName: "wot m9 i go afk",
        tagLine: "EUW",
        tier: "Platinum IV",
        lp: 66,
        games: 10,
        wins: 6,
        losses: 4,
        opggUrl: "https://www.op.gg/",
      }]);
    }

    const key = process.env.RIOT_API_KEY;
    if (!key) return NextResponse.json({ ok:false, error:"Falta RIOT_API_KEY en .env.local" }, { status: 500 });

    const gameName = process.env.PLAYER_GAME_NAME || "wot m9 i go afk";
    const tagLine  = (process.env.PLAYER_TAG || "EUW").toUpperCase();
    const R = ROUTES[tagLine];
    if (!R) return NextResponse.json({ ok:false, error:`Región no soportada: ${tagLine}` }, { status: 400 });

    // 1) Riot ID → Account (PUUID)
    const acc = await riot<AccountDto>(
      `https://${R.regional}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
      "account/by-riot-id"
    );

    // 2) PUUID → Summoner (para icono y, si hay suerte, id)
    const sum = await riot<SummonerDto>(
      `https://${R.platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${acc.puuid}`,
      "summoner/by-puuid"
    );

    // 3) Liga (no rompemos si falla → Unranked)
    let tier = "Unranked";
    let lp = 0;
    try {
      if (sum.id) {
        const leagues = await riot<LeagueEntry[]>(
          `https://${R.platform}.api.riotgames.com/lol/league/v4/entries/by-summoner/${sum.id}`,
          "league/by-summoner"
        );
        const solo = leagues.find(l => l.queueType === "RANKED_SOLO_5x5");
        if (solo) { tier = `${cap(solo.tier)} ${solo.rank}`; lp = Number(solo.leaguePoints) || 0; }
      }
    } catch {
      // dejamos Unranked/0 LP si 401/403/429
    }

    // 4) Últimas ranked solo/duo → W/L
    const ids = await riot<string[]>(
      `https://${R.regional}.api.riotgames.com/lol/match/v5/matches/by-puuid/${acc.puuid}/ids?queue=420&count=${MATCH_COUNT}`,
      "match ids"
    );
    let wins = 0, losses = 0;
    for (const id of ids) {
      try {
        const match = await riot<MatchDto>(
          `https://${R.regional}.api.riotgames.com/lol/match/v5/matches/${id}`,
          `match ${id}`
        );
        const me = match.info?.participants?.find(x => x.puuid === acc.puuid);
        if (me) me.win ? wins++ : losses++;
      } catch { /* ignorar partida que falle */ }
    }

    const avatarUrl = `https://ddragon.leagueoflegends.com/cdn/14.20.1/img/profileicon/${sum.profileIconId}.png`;

    return NextResponse.json([{
      id: "self",
      rank: 1,
      avatarUrl,
      gameName: acc.gameName,
      tagLine: acc.tagLine,
      tier,
      lp,
      games: wins + losses,
      wins,
      losses,
      opggUrl: `https://www.op.gg/summoners/${R.opgg}/${encodeURIComponent(acc.gameName)}-${encodeURIComponent(acc.tagLine)}`
    }]);
  } catch (err: any) {
    return NextResponse.json(
      { ok:false, error: String(err?.message || err) },
      { status: 500 }
    );
  }
}
