#!/usr/bin/env python3
"""Turn a raw dump of the #quotes channel into public/data/quotes.json.

Input is whatever fetch_quotes.py wrote (a plain list of Discord message
objects). Most of the work here is throwing things away: the channel is a
normal chat channel, so somewhere under half of what is in it is an actual
quote and the rest is people reacting to the quotes.
"""

import json
import os
import re
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

GUILD_ID = "1437357663406002288"
CHANNEL_ID = "1437373994377412640"

MENTION = re.compile(r"<@!?(\d+)>")
ROLE_MENTION = re.compile(r"<@&(\d+)>")
CUSTOM_EMOJI = re.compile(r"<a?:\w+:\d+>")
URL = re.compile(r"https?://\S+")
TIMESTAMP = re.compile(r"<t:\d+(?::[a-zA-Z])?>")

# Straight and curly pairs. Kept separate so a message that mixes them (people
# do, phone keyboards autocorrect one and not the other) still splits sanely.
QUOTE_SPAN = re.compile(r'"([^"\n]{1,600})"|\u201c([^\u201d\n]{1,600})\u201d')

# "Name:" in front of the quote, the other common shape after '- Name' behind it.
PREFIX_SPEAKER = re.compile(r"^\s*([^\s:][^:\n]{0,24}):\s*(?=[\"\u201c])")

# Leading dash on an attribution. Includes the minus sign because at least one
# person types it on a numpad.
LEAD_DASH = re.compile(r"^[\s\-\u2010\u2011\u2012\u2013\u2014\u2212]+")

BARE_NAME = re.compile(r"^([A-Za-z\u00c6\u00d8\u00c5\u00e6\u00f8\u00e5][\w\u00c6\u00d8\u00c5\u00e6\u00f8\u00e5.'-]{1,19})")

# Words that show up right after a quote but are the sentence continuing, not a
# name. Without this "- til Content Creator" reads as a person called "til".
NOT_A_NAME = {
    "til", "efter", "og", "da", "der", "det", "den", "de", "i", "in", "som",
    "med", "mens", "imens", "om", "on", "part", "af", "for", "fra", "hvad",
    "han", "hun", "hans", "hendes", "siger", "sagde", "svarer", "svarede",
    "spurgte", "mente", "et", "en", "on", "to", "the", "a", "at", "sig",
    "ca", "ps", "context", "kontekst", "mvh", "self", "vist", "vel", "ikke",
    "tekst", "omkring", "apropos", "citat", "svar", "spurgt", "sagt", "ang",
    "jeg", "vi", "du", "man", "so", "but", "og", "eller", "ift", "under",
    "over", "bagefter", "senere", "lige", "pt", "aka", "fra",
}


def load_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def read_list(path):
    """One entry per line, '#' starts a comment, blanks ignored."""
    if not os.path.exists(path):
        return []
    out = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.split("#", 1)[0].strip()
            if line:
                out.append(line)
    return out


def strip_markup(text):
    text = CUSTOM_EMOJI.sub(" ", text)
    text = MENTION.sub(" ", text)
    text = ROLE_MENTION.sub(" ", text)
    text = TIMESTAMP.sub(" ", text)
    text = URL.sub(" ", text)
    return text


MD_BOLD_ITALIC = re.compile(r"(\*{1,3}|_{2,3}|~~|\|\|)")


def hide_mentions(text, names):
    """Turn pings at people who asked to be left off the site into 'nogen'.

    Everybody else keeps their ping. Names are not written into quotes.json at
    all: the ping stays in, and the browser looks the id up in navne.json, so
    a nickname changed on discord this morning is the one on the page now.
    Hiding somebody is the one thing that cannot wait for that, so it happens
    here, where the ping is thrown away instead of resolved.
    """
    text = MENTION.sub(
        lambda m: "@nogen" if names.is_hidden(m.group(1)) else m.group(0), text)
    return text


def render_text(text, names):
    """What the quote should look like on the page.

    Custom emoji and asterisks are written for discord and mean nothing
    outside it, so they go. The pings stay, see hide_mentions.
    """
    text = hide_mentions(text, names)
    text = CUSTOM_EMOJI.sub(lambda m: "", text)
    text = MD_BOLD_ITALIC.sub("", text)
    return re.sub(r"\s+", " ", text).strip()


def letters_only(text):
    return "".join(c for c in strip_markup(text) if c.isalpha())


def fold(text):
    """Normalise for dedupe and for blocklist matching."""
    text = unicodedata.normalize("NFKD", text.lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    # Defeats n*gger, n1gger, n i g g e r and friends. Not bulletproof, nothing
    # of this shape is, but it catches what is actually in the channel.
    return re.sub(r"[^a-z0-9]+", "", text)


class Names:
    """Who a discord id belongs to, as the server spells it right now.

    Nothing here is maintained by hand. tools/members.json is a dump of the
    server, so somebody who renames themselves renames themselves on the site
    too, jokes and all: the id 873891628660719677 prints as "Den mest
    eksotiske white-guy" because that is what it says on discord.

    A name that was typed by hand instead of pinged is left exactly as typed.
    Those are teachers and other people who are not on the server, so there is
    no id to look up and no second spelling to prefer.
    """

    def __init__(self, members_path, hide_path):
        data = load_json(members_path)
        self.users = {uid: u["navn"] for uid, u in data.get("users", {}).items()}
        self.alias = {uid: set(u.get("alias", [])) | {u["navn"]}
                      for uid, u in data.get("users", {}).items()}
        self.roles = data.get("roles", {})
        self.hidden = set(load_json(hide_path).get("hide", []))
        # Hiding someone has to cover the name typed by hand as well as the
        # ping, otherwise '- Mikkel <@mikkel>' hides the ping and prints the
        # name anyway. Names inside the quote itself are left alone: that is
        # what the person said, not who the site says said it.
        self._hidden_names = {fold(n) for uid in self.hidden
                              for n in self.alias.get(uid, ()) if n}

    def user(self, uid):
        if uid in self.hidden:
            return None
        return self.users.get(uid)

    def is_hidden(self, uid):
        return uid in self.hidden

    def is_hidden_name(self, name):
        return bool(name) and fold(name) in self._hidden_names

    def role(self, rid):
        return self.roles.get(rid)

    def is_same_person(self, uid, name):
        """Is this hand-typed name the person behind this ping?

        '- Mikkel <@445...>' is one person named twice, but the site prints him
        as Timothy Tangherlini, so comparing against the printed name alone
        would read it as Mikkel saying something to somebody else. Every name
        the account has counts: nickname, display name and username.
        """
        if not name:
            return False
        target = fold(name)
        return any(fold(a) == target for a in self.alias.get(uid, ()) if a)


def clean_note(text):
    """Whatever is left of an attribution once the name is out of it.

    Pings bliver stående. De bliver slået op i browseren ligesom i selve
    citatet, så 'til <@id>' står med det navn personen har lige nu.
    """
    text = CUSTOM_EMOJI.sub(" ", text)
    text = TIMESTAMP.sub(" ", text)
    text = URL.sub(" ", text)
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"^[\s,.:;)\]\-\u2010-\u2015\u2212]+", "", text)
    text = re.sub(r"[\s,.:;(\[\-\u2010-\u2015\u2212]+$", "", text)
    # People open a parenthesis before the quote and close it after, which
    # leaves a stray bracket on one end once the quote is lifted out.
    if text.count("(") != text.count(")"):
        text = text.replace("(", "").replace(")", "")
    text = text.strip()
    vejet = ROLE_MENTION.sub(" navn ", MENTION.sub(" navn ", text))
    if len(text) > 120 or len(letters_only(vejet)) < 3:
        return ""
    return text


def parse_attribution(tail, names):
    """Read '- Mikkel <@445...> til Content Creator møde' into a speaker + note.

    The third return value says whether an attribution was there at all, which
    is not the same as knowing who it was: someone who has left the server, or
    who asked to be left off the site, points at a real person we cannot name.
    """
    tail = tail.strip()
    if not tail:
        return None, "", False

    mention = MENTION.search(tail)
    role = None if mention else ROLE_MENTION.search(tail)
    hit = mention or role

    if hit is None:
        head = LEAD_DASH.sub("", tail)
        bare = BARE_NAME.match(head)
        if bare and bare.group(1).lower() not in NOT_A_NAME:
            return bare.group(1), clean_note(head[bare.end():]), True
        return None, clean_note(tail), False

    # Bliver ikke til et navn her. Et ping går videre som et ping og bliver
    # først til et navn i browseren, hvor navnet er det aktuelle.
    resolved = hit.group(0) if (role or not names.is_hidden(mention.group(1))) else None
    before = LEAD_DASH.sub("", tail[: hit.start()])
    after = tail[hit.end():]

    bare = BARE_NAME.match(before)
    lead = bare.group(1) if bare and bare.group(1).lower() not in NOT_A_NAME else None

    # '- Mikkel <@mikkel>' where Mikkel asked to be left off the site: hiding
    # the ping and printing the name he was typed under would defeat the point.
    if mention and names.is_hidden(mention.group(1)):
        rest = before[bare.end():] if bare else before
        return None, clean_note(rest + " " + after), True

    # '- Tristan <@id>' er én person nævnt to gange, '- Sofie til <@malte>' er
    # to. Forskellen står imellem dem: er der ingenting mellem navnet og
    # pinget, er det den samme. Navnene behøver ikke ligne hinanden, folk
    # skriver "Tristan" om en der hedder "Trisdan" på serveren.
    mellem = before[bare.end():].strip(" ,.:;-()") if bare else ""
    if lead and not mellem:
        same = True
    elif mention:
        same = names.is_same_person(mention.group(1), lead)
    else:
        rollenavn = names.role(role.group(1))
        same = bool(lead and rollenavn and fold(lead) == fold(rollenavn))

    if lead and resolved and same:
        # '- Mikkel <@mikkel>': the name and the ping are the same person, and
        # the ping is the half that follows him when he renames himself.
        return resolved, clean_note(before[bare.end():] + " " + after), True

    if lead and resolved:
        # '- Sofie til <@malte>': the name speaks, the ping is who they said it
        # to, so the ping belongs in the note and not in the byline.
        return lead, clean_note(before[bare.end():] + " " + resolved + " " + after), True

    if lead:
        return lead, clean_note(before[bare.end():] + " " + after), True

    return resolved, clean_note(before + " " + after), True


def parse_message(msg, names):
    """Return a list of {text, speaker, note} lines, or [] if this is not a quote."""
    content = msg.get("content", "")
    if not content or ('"' not in content and "\u201c" not in content):
        return []

    lines = []
    all_at_line_start = True
    raw_lines = content.split("\n")

    for index, raw in enumerate(raw_lines):
        prefix = PREFIX_SPEAKER.match(raw)
        prefix_speaker = prefix.group(1).strip() if prefix else None
        if prefix_speaker and (
            prefix_speaker.lower() in NOT_A_NAME or len(prefix_speaker) > 24
        ):
            prefix_speaker = None

        spans = list(QUOTE_SPAN.finditer(raw))
        for pos, span in enumerate(spans):
            text = (span.group(1) or span.group(2) or "").strip()
            if len(letters_only(text)) < 4:
                continue

            body_start = prefix.end() if (prefix and pos == 0) else 0
            if span.start() > body_start:
                all_at_line_start = False

            end = spans[pos + 1].start() if pos + 1 < len(spans) else len(raw)
            speaker, note, attributed = parse_attribution(raw[span.end() : end], names)

            # '"..."' on one line and '- <@id>' on the next is common enough to
            # be worth reaching forward for, but only when the next line is
            # nothing but an attribution.
            if speaker is None and pos == len(spans) - 1:
                nxt = raw_lines[index + 1] if index + 1 < len(raw_lines) else ""
                if nxt.strip() and not QUOTE_SPAN.search(nxt) and len(nxt) < 80:
                    speaker, extra, attributed = parse_attribution(nxt, names)
                    if speaker and not note:
                        note = extra

            if speaker is None and prefix_speaker and pos == 0:
                speaker = prefix_speaker
                attributed = True

            if speaker and not MENTION.fullmatch(speaker) and not ROLE_MENTION.fullmatch(speaker):
                # Left as typed on purpose. A hand-typed name is somebody
                # who is not on the server to ask, usually a teacher, so the
                # spelling in the quote is the only one there is.
                speaker = re.sub(r"\s+", " ", speaker).strip(" ,.:;-")
                if names.is_hidden_name(speaker):
                    speaker = None

            lines.append({
                "text": render_text(text, names),
                "speaker": speaker,
                "note": note,
                "attributed": attributed,
            })

    if not lines:
        return []

    # A quote nobody is attributed to, sitting mid-sentence, is somebody quoting
    # a word back at each other in normal conversation. Drop it.
    if not any(line["attributed"] for line in lines) and not all_at_line_start:
        return []

    for line in lines:
        del line["attributed"]
        if not line["note"]:
            del line["note"]
        # Et ping bliver til et id i filen, et håndskrevet navn bliver til
        # tekst. Browseren kender forskellen og slår kun id'et op.
        taler = line.pop("speaker")
        if not taler:
            continue
        person = MENTION.fullmatch(taler)
        rolle = ROLE_MENTION.fullmatch(taler)
        if person:
            line["speakerId"] = person.group(1)
        elif rolle:
            line["speakerRole"] = rolle.group(1)
        else:
            line["speaker"] = taler

    return lines


def main():
    raw_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "quotes_raw.json")
    names = Names(os.path.join(HERE, "members.json"),
                  os.path.join(HERE, "names.json"))
    blocked_words = [fold(w) for w in read_list(os.path.join(HERE, "blocklist.txt"))]
    blocked_words = [w for w in blocked_words if w]
    excluded_ids = set(read_list(os.path.join(HERE, "exclude.txt")))
    forced_ids = set(read_list(os.path.join(HERE, "include.txt")))

    messages = load_json(raw_path)
    messages.sort(key=lambda m: int(m["id"]))

    quotes = []
    flagged = []
    seen = set()
    counts = {"total": len(messages), "not_a_quote": 0, "duplicate": 0,
              "excluded": 0, "blocked": 0}

    for msg in messages:
        if msg.get("author", {}).get("bot"):
            counts["not_a_quote"] += 1
            continue
        if msg.get("type") not in (0, 19):
            counts["not_a_quote"] += 1
            continue

        lines = parse_message(msg, names)
        if not lines:
            counts["not_a_quote"] += 1
            continue

        key = fold(" ".join(line["text"] for line in lines))
        if key in seen:
            counts["duplicate"] += 1
            continue
        seen.add(key)

        entry = {
            "id": msg["id"],
            "lines": lines,
            # Hvem der skrev citatet ind, som id. Navnet slår browseren op.
            "postedById": (None if names.is_hidden(msg["author"]["id"])
                           else msg["author"]["id"]),
            "date": msg["timestamp"][:10],
            "url": f"https://discord.com/channels/{GUILD_ID}/{CHANNEL_ID}/{msg['id']}",
        }

        if msg["id"] in excluded_ids:
            counts["excluded"] += 1
            continue

        if msg["id"] not in forced_ids:
            haystack = fold(" ".join(
                [line["text"] for line in lines]
                + [line.get("note", "") for line in lines]
                + [line.get("speaker") or "" for line in lines]
            ))
            hits = [w for w in blocked_words if w in haystack]
            if hits:
                counts["blocked"] += 1
                flagged.append({**entry, "matched": hits})
                continue

        quotes.append(entry)

    quotes.sort(key=lambda q: int(q["id"]))

    out_path = os.path.join(ROOT, "public", "data", "quotes.json")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump({"generated": messages[-1]["timestamp"][:10] if messages else None,
                   "count": len(quotes),
                   "quotes": quotes}, fh, ensure_ascii=False, indent=1)
        fh.write("\n")

    flagged_path = os.path.join(HERE, "flagged.json")
    with open(flagged_path, "w", encoding="utf-8") as fh:
        json.dump(flagged, fh, ensure_ascii=False, indent=1)
        fh.write("\n")

    print(f"messages seen   {counts['total']}")
    print(f"not a quote     {counts['not_a_quote']}")
    print(f"duplicates      {counts['duplicate']}")
    print(f"in exclude.txt  {counts['excluded']}")
    print(f"hit blocklist   {counts['blocked']}  (written to tools/flagged.json)")
    print(f"published       {len(quotes)}  -> public/data/quotes.json")


if __name__ == "__main__":
    main()
