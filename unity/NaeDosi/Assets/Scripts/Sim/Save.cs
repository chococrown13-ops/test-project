using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using static NaeDosi.Defs;
using static NaeDosi.WorldOps;

namespace NaeDosi
{
    /// <summary>
    /// Saves in exactly the web game's format (port of sim/save.ts): one JSON object with the grids as
    /// base64, deflated and marked with a leading 'Z'. A .city file from the web game opens here, and one
    /// saved here opens there.
    /// </summary>
    public static class Save
    {
        static readonly string[] ARRAYS = { "ground", "road", "roadAlt", "altLevel", "diag", "oneway", "hwy", "snow", "parked", "parkPress", "trees", "zone", "bld", "land", "traffic", "pollution", "edu", "safety", "fire", "health", "transit" };

        static string B64(byte[] a) => Convert.ToBase64String(a);
        static string B64(int[] a) { var b = new byte[a.Length * 4]; Buffer.BlockCopy(a, 0, b, 0, b.Length); return Convert.ToBase64String(b); }
        static string B64(float[] a) { var b = new byte[a.Length * 4]; Buffer.BlockCopy(a, 0, b, 0, b.Length); return Convert.ToBase64String(b); }
        static byte[] U8(string s) => Convert.FromBase64String(s);
        static int[] I32(string s) { var b = U8(s); var a = new int[b.Length / 4]; Buffer.BlockCopy(b, 0, a, 0, a.Length * 4); return a; }
        static float[] F32(string s) { var b = U8(s); var a = new float[b.Length / 4]; Buffer.BlockCopy(b, 0, a, 0, a.Length * 4); return a; }


        static List<object> Ints(IEnumerable<int> l) => l.Select(x => (object)(double)x).ToList();

        static Dictionary<string, object> Month(MonthReport m)
        {
            var inc = new Dictionary<string, object> { ["R"] = m.incR, ["C"] = m.incC, ["I"] = m.incI, ["T"] = m.incT, ["V"] = m.incV, ["G"] = m.incG, ["S"] = m.incS, ["H"] = m.incH };
            var exp = new Dictionary<string, object> { ["roads"] = m.expRoads, ["facilities"] = m.expFacilities, ["services"] = m.expServices, ["transit"] = m.expTransit, ["debt"] = m.expDebt, ["snow"] = m.expSnow };
            return new Dictionary<string, object> { ["month"] = (double)m.month, ["income"] = inc, ["expense"] = exp, ["pop"] = m.pop, ["jobs"] = m.jobs };
        }

        static MonthReport ReadMonth(Dictionary<string, object> o)
        {
            var inc = o.O("income"); var exp = o.O("expense");
            return new MonthReport
            {
                month = o.I("month"), pop = o.D("pop"), jobs = o.D("jobs"),
                incR = inc.D("R"), incC = inc.D("C"), incI = inc.D("I"), incT = inc.D("T"), incV = inc.D("V"), incG = inc.D("G"), incS = inc.D("S"), incH = inc.D("H"),
                expRoads = exp.D("roads"), expFacilities = exp.D("facilities"), expServices = exp.D("services"), expTransit = exp.D("transit"), expDebt = exp.D("debt"), expSnow = exp.D("snow"),
            };
        }

        public static string serialize(World w)
        {
            var o = new Dictionary<string, object>();
            o["name"] = w.name; o["seed"] = w.seed; o["map"] = w.map;
            if (w.real != null) o["real"] = new Dictionary<string, object> { ["cells"] = B64(w.real.cells), ["row"] = (double)w.real.row, ["id"] = w.real.id, ["name"] = w.real.name, ["prov"] = w.real.prov, ["lat"] = w.real.lat, ["lon"] = w.real.lon };
            o["rng"] = (double)w.rng; o["day"] = (double)w.day; o["money"] = w.money;
            if (w.slot != null) o["slot"] = w.slot;
            o["loans"] = w.loans.Select(l => (object)new Dictionary<string, object> { ["left"] = l.left, ["pay"] = l.pay, ["months"] = l.months, ["amount"] = l.amount }).ToList();
            o["tollPass"] = w.tollPass;
            o["cold"] = w.cold == null ? null : new Dictionary<string, object> { ["start"] = (double)w.cold.Value.start, ["end"] = (double)w.cold.Value.end };
            if (w.coldLast != int.MinValue) o["coldLast"] = (double)w.coldLast;
            if (w.noHazards) o["noHazards"] = true;
            o["curves"] = w.curves.Select(c => (object)new Dictionary<string, object> { ["ax"] = c.ax, ["az"] = c.az, ["cx"] = c.cx, ["cz"] = c.cz, ["bx"] = c.bx, ["bz"] = c.bz, ["t"] = (double)c.t, ["cells"] = Ints(c.cells), ["own"] = Ints(c.own) }).ToList();
            o["roundabouts"] = w.roundabouts.Select(r => (object)new Dictionary<string, object> { ["cell"] = (double)r.cell, ["t"] = (double)r.t }).ToList();
            o["festival"] = w.festival == null ? null : new Dictionary<string, object> { ["kind"] = w.festival.kind, ["name"] = w.festival.name, ["x"] = w.festival.x, ["z"] = w.festival.z, ["until"] = (double)w.festival.until, ["days"] = (double)w.festival.days, ["visitors"] = w.festival.visitors, ["spend"] = w.festival.spend };
            o["bikeMonth"] = w.bikeMonth; o["bikeLast"] = w.bikeLast; o["intercityMonth"] = w.intercityMonth; o["intercityLast"] = w.intercityLast;
            o["noAvenueParking"] = w.noAvenueParking;
            foreach (var k in ARRAYS)
            {
                o[k] = k switch
                {
                    "bld" => B64(w.bld), "land" => B64(w.land), "traffic" => B64(w.traffic), "pollution" => B64(w.pollution),
                    _ => B64(ByteArray(w, k)),
                };
            }
            o["lines"] = w.lines.Select(l =>
            {
                var d = new Dictionary<string, object> { ["id"] = (double)l.id, ["kind"] = l.kind, ["name"] = l.name, ["color"] = l.color, ["stops"] = Ints(l.stops), ["ridersMonth"] = l.ridersMonth, ["riders"] = l.riders };
                if (l.bus != null) d["bus"] = l.bus;
                return (object)d;
            }).ToList();
            o["nextLine"] = (double)w.nextLine; o["transferDiscount"] = w.transferDiscount; o["transfersMonth"] = w.transfersMonth; o["transfers"] = w.transfers;
            o["buildings"] = w.buildings.Values.Select(b =>
            {
                var d = new Dictionary<string, object>
                {
                    ["id"] = (double)b.id, ["kind"] = b.kind, ["x"] = (double)b.x, ["y"] = (double)b.y, ["size"] = (double)b.size,
                    ["floors"] = (double)b.floors, ["look"] = b.look, ["occ"] = b.occ, ["powered"] = b.powered, ["watered"] = b.watered, ["sewered"] = b.sewered,
                    ["happy"] = b.happy, ["outage"] = b.outage, ["abandoned"] = b.abandoned, ["builtDay"] = (double)b.builtDay,
                };
                if (b.sx > 0) { d["sx"] = (double)b.sx; d["sy"] = (double)b.sy; }
                if (b.burn != 0) d["burn"] = b.burn;
                return (object)d;
            }).ToList();
            o["nextId"] = (double)w.nextId;
            o["tax"] = new Dictionary<string, object> { ["R"] = w.taxR, ["C"] = w.taxC, ["I"] = w.taxI };
            o["demand"] = new Dictionary<string, object> { ["R"] = w.demR, ["C"] = w.demC, ["I"] = w.demI };
            var s = w.stats;
            var st = new Dictionary<string, object>
            {
                ["pop"] = s.pop, ["jobs"] = s.jobs, ["workers"] = s.workers, ["employed"] = s.employed, ["powerSupply"] = s.powerSupply, ["powerUse"] = s.powerUse,
                ["waterSupply"] = s.waterSupply, ["waterUse"] = s.waterUse, ["sewageCap"] = s.sewageCap, ["sewageUse"] = s.sewageUse, ["happy"] = s.happy,
                ["commute"] = s.commute, ["congestion"] = s.congestion, ["parkDemand"] = s.parkDemand, ["parkUnmet"] = s.parkUnmet, ["parkCurb"] = s.parkCurb,
            };
            if (s.parkWorst >= 0) st["parkWorst"] = (double)s.parkWorst;
            o["stats"] = st;
            o["reports"] = w.reports.Select(r => (object)Month(r)).ToList();
            o["month"] = Month(w.month);
            o["notices"] = w.notices.Select(n =>
            {
                var d = new Dictionary<string, object> { ["day"] = (double)n.day, ["text"] = n.text, ["tone"] = n.tone };
                if (n.at >= 0) d["at"] = (double)n.at;
                if (n.overlay != null) d["overlay"] = n.overlay;
                return (object)d;
            }).ToList();
            o["ver"] = new Dictionary<string, object> { ["roads"] = (double)w.ver.roads, ["zones"] = (double)w.ver.zones, ["buildings"] = (double)w.ver.buildings, ["transit"] = (double)w.ver.transit };
            o["milestones"] = Ints(w.milestones);
            if (w.hasGoal) o["goal"] = (double)w.goal;
            if (w.hasChapterPaid) o["chapterPaid"] = (double)w.chapterPaid;
            if (w.achieved != null) o["achieved"] = w.achieved.Select(x => (object)x).ToList();
            if (w.everLoan) o["everLoan"] = true;
            if (w.specs != null) o["specs"] = w.specs.Select(x => (object)x).ToList();
            return Json.Write(o);
        }

        static byte[] ByteArray(World w, string k) => k switch
        {
            "ground" => w.ground, "road" => w.road, "roadAlt" => w.roadAlt, "altLevel" => w.altLevel, "diag" => w.diag, "oneway" => w.oneway,
            "hwy" => w.hwy, "snow" => w.snow, "parked" => w.parked, "parkPress" => w.parkPress, "trees" => w.trees, "zone" => w.zone,
            "edu" => w.edu, "safety" => w.safety, "fire" => w.fire, "health" => w.health, "transit" => w.transit, _ => null,
        };

        static List<int> IntList(List<object> l) => l == null ? new List<int>() : l.Select(x => (int)(double)x).ToList();

        public static World deserialize(string json)
        {
            var o = (Dictionary<string, object>)Json.Parse(json);
            var w = createWorld(o.D("seed"), o.S("name"), o.S("map") ?? "river");
            int size = w.ground.Length;
            byte[] U8or(string k) => o.Has(k) ? U8(o.S(k)) : new byte[size];
            w.rng = (uint)o.D("rng"); w.day = o.I("day"); w.money = o.D("money"); w.slot = o.S("slot");
            w.ground = U8(o.S("ground")); w.road = U8(o.S("road")); w.zone = U8(o.S("zone"));
            w.roadAlt = U8or("roadAlt"); w.altLevel = U8or("altLevel"); w.diag = U8or("diag"); w.oneway = U8or("oneway"); w.hwy = U8or("hwy");
            w.snow = U8or("snow"); w.parked = U8or("parked"); w.parkPress = U8or("parkPress"); w.trees = U8or("trees");
            w.bld = I32(o.S("bld"));
            w.land = F32(o.S("land")); w.traffic = F32(o.S("traffic")); w.pollution = F32(o.S("pollution"));
            w.edu = U8or("edu"); w.safety = U8or("safety"); w.fire = U8or("fire"); w.health = U8or("health"); w.transit = U8or("transit");
            w.civic = new byte[size];
            w.loans = (o.L("loans") ?? new List<object>()).Select(x => { var d = (Dictionary<string, object>)x; return new Loan { left = d.D("left"), pay = d.D("pay"), months = d.D("months"), amount = d.D("amount") }; }).ToList();
            w.tollPass = o.D("tollPass");
            var cold = o.O("cold"); w.cold = cold == null ? ((int, int)?)null : (cold.I("start"), cold.I("end"));
            w.coldLast = o.Has("coldLast") ? o.I("coldLast") : int.MinValue;
            w.noHazards = o.B("noHazards");
            w.curves = (o.L("curves") ?? new List<object>()).Select(x =>
            {
                var d = (Dictionary<string, object>)x;
                return new Curve { ax = d.D("ax"), az = d.D("az"), cx = d.D("cx"), cz = d.D("cz"), bx = d.D("bx"), bz = d.D("bz"), t = d.I("t"), cells = IntList(d.L("cells")), own = IntList(d.L("own")) };
            }).ToList();
            w.roundabouts = (o.L("roundabouts") ?? new List<object>()).Select(x => { var d = (Dictionary<string, object>)x; return new Roundabout { cell = d.I("cell"), t = d.I("t") }; }).ToList();
            var f = o.O("festival");
            w.festival = f == null ? null : new Festival { kind = f.S("kind"), name = f.S("name"), x = f.D("x"), z = f.D("z"), until = f.I("until"), days = f.I("days"), visitors = f.D("visitors"), spend = f.D("spend") };
            w.bikeMonth = o.D("bikeMonth"); w.bikeLast = o.D("bikeLast"); w.intercityMonth = o.D("intercityMonth"); w.intercityLast = o.D("intercityLast");
            w.noAvenueParking = o.B("noAvenueParking");
            var real = o.O("real");
            if (real != null) w.real = new RealLand { cells = U8(real.S("cells")), row = real.I("row"), id = real.S("id"), name = real.S("name"), prov = real.S("prov"), lat = real.D("lat"), lon = real.D("lon") };
            w.lines = (o.L("lines") ?? new List<object>()).Select(x =>
            {
                var d = (Dictionary<string, object>)x;
                return new TransitLine { id = d.I("id"), kind = d.S("kind"), name = d.S("name"), color = d.S("color"), stops = IntList(d.L("stops")), bus = d.S("bus"), ridersMonth = d.D("ridersMonth"), riders = d.D("riders") };
            }).ToList();
            w.nextLine = o.Has("nextLine") ? o.I("nextLine") : 1;
            w.transferDiscount = o.B("transferDiscount", true);
            w.transfersMonth = o.D("transfersMonth"); w.transfers = o.D("transfers");
            w.buildings = new SortedDictionary<int, Building>();
            foreach (var x in o.L("buildings") ?? new List<object>())
            {
                var d = (Dictionary<string, object>)x;
                var b = new Building
                {
                    id = d.I("id"), kind = d.S("kind"), x = d.I("x"), y = d.I("y"), size = d.I("size"), sx = d.I("sx"), sy = d.I("sy"),
                    floors = d.I("floors"), look = d.D("look"), occ = d.D("occ"), powered = d.B("powered"), watered = d.B("watered"), sewered = d.B("sewered"),
                    happy = d.D("happy", 60), outage = d.D("outage"), abandoned = d.B("abandoned"), builtDay = d.I("builtDay"), burn = d.D("burn"),
                };
                if (b.sx > 0 && b.sy == 0) b.sy = b.size;
                if (b.sy > 0 && b.sx == 0) b.sx = b.size;
                w.buildings[b.id] = b;
            }
            w.nextId = o.I("nextId", 1);
            var tax = o.O("tax"); w.taxR = tax.D("R", 9); w.taxC = tax.D("C", 9); w.taxI = tax.D("I", 9);
            var dem = o.O("demand"); w.demR = dem.D("R", 60); w.demC = dem.D("C", 25); w.demI = dem.D("I", 35);
            var st = o.O("stats");
            w.stats = new Stats
            {
                pop = st.D("pop"), jobs = st.D("jobs"), workers = st.D("workers"), employed = st.D("employed"), powerSupply = st.D("powerSupply"), powerUse = st.D("powerUse"),
                waterSupply = st.D("waterSupply"), waterUse = st.D("waterUse"), sewageCap = st.D("sewageCap"), sewageUse = st.D("sewageUse"), happy = st.D("happy", 60),
                commute = st.D("commute"), congestion = st.D("congestion"), parkDemand = st.D("parkDemand"), parkUnmet = st.D("parkUnmet"), parkCurb = st.D("parkCurb"),
                parkWorst = st.Has("parkWorst") ? st.I("parkWorst") : -1,
            };
            w.reports = (o.L("reports") ?? new List<object>()).Select(x => ReadMonth((Dictionary<string, object>)x)).ToList();
            w.month = o.Has("month") ? ReadMonth(o.O("month")) : emptyMonth(0);
            w.notices = (o.L("notices") ?? new List<object>()).Select(x =>
            {
                var d = (Dictionary<string, object>)x;
                return new Notice { day = d.I("day"), text = d.S("text"), tone = d.S("tone") ?? "info", at = d.Has("at") ? d.I("at") : -1, overlay = d.S("overlay") };
            }).ToList();
            var ver = o.O("ver");
            w.ver = new Ver { roads = ver.I("roads") + 1, zones = ver.I("zones") + 1, buildings = ver.I("buildings") + 1, transit = ver.I("transit") + 1 };
            w.milestones = IntList(o.L("milestones"));
            if (o.Has("goal")) { w.goal = o.I("goal"); w.hasGoal = true; }
            if (o.Has("chapterPaid")) { w.chapterPaid = o.I("chapterPaid"); w.hasChapterPaid = true; }
            if (o.L("achieved") != null) w.achieved = o.L("achieved").Select(x => (string)x).ToList();
            w.everLoan = o.B("everLoan");
            if (o.L("specs") != null) w.specs = o.L("specs").Select(x => (string)x).ToList();
            return w;
        }

        public static string pack(World w) => "Z" + Convert.ToBase64String(Deflate.Compress(Encoding.UTF8.GetBytes(serialize(w))));

        public static World unpack(string s)
        {
            string json = s.StartsWith("Z") ? Encoding.UTF8.GetString(Deflate.Inflate(Convert.FromBase64String(s.Substring(1)))) : s;
            var w = deserialize(json);
            return w.ground.Length == N * N ? w : null;
        }
    }
}
