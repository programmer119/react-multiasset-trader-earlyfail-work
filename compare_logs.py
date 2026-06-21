import re
import sys

def parse_file(filepath):
    parsed_lines = []
    with open(filepath, 'r', encoding='utf-8') as f:
        for idx, line in enumerate(f, 1):
            line_str = line.strip()
            if not line_str:
                continue
            # Check if it's a daily summary line, e.g., 20221026(268/278(D1))
            if re.match(r'^\d{8}\(', line_str):
                parsed_lines.append({
                    'orig_idx': idx,
                    'type': 'SUMMARY',
                    'content': line_str
                })
            # Check if it's a trade line
            elif line_str.startswith(('BUYS ', 'SELL ', 'SELR ', 'SELA ')):
                parsed_lines.append({
                    'orig_idx': idx,
                    'type': 'TRADE',
                    'content': line_str
                })
    return parsed_lines

def clean_summary(s):
    # Summary format:
    # 20221101(268/278(D1)) +1.17% VS KP:+1.82% KD:+0.68% ₩51767539=stock(₩49448984)+money(₩2318555)+injurancetotalmoney(₩0) stockkind:11 traded:{"FORCE_SHORTRecyclingFor(B)":2,"FORCE_RSI_LONG":1} 1m:+3.87%,
    # Let's normalize it to just compare date, percentage, total asset, stock asset, money asset, and stockkind.
    # We can clean up spaces.
    s = re.sub(r'\s+', ' ', s)
    # Remove trailing 1m:... or anything after traded:{...}
    s = re.sub(r' \d+m:.*$', '', s)
    # Remove any trailing commas or spaces
    s = s.strip().rstrip(',')
    return s

def clean_trade(s):
    # 1. Normalize spaces
    s = re.sub(r'\s+', ' ', s).strip()
    
    # 2. Strip out (T)=..., GATE:..., CAN:..., NEED:..., GB:...
    s = re.sub(r'\(T\)=[^\s\]]+', '', s)
    s = re.sub(r'GATE:[^\s]+', '', s)
    s = re.sub(r'CAN:[^\s]+', '', s)
    s = re.sub(r'NEED:[^\s]+', '', s)
    s = re.sub(r'GB:[^\s]+', '', s)
    
    # 3. Simplify stock mentions: a123456 StockName MARKET -> a123456
    # e.g., "a047920 HLB제약 KOSDAQ" -> "a047920"
    s = re.sub(r'(a\d{6})\s+[^\s]+\s+(KOSDAQ|KOSPI)', r'\1', s)
    
    # 4. Simplify "because buy" clause: "because buy a028670 팬오션 KOSPI FORCE_SHORTRecyclingFor(B)" -> "because buy a028670"
    s = re.sub(r'because buy\s+(a\d{6})\s+[^\s]+\s+(KOSDAQ|KOSPI)\s+[^\s]+', r'because buy \1', s)
    s = re.sub(r'because buy\s+(a\d{6})[^\s]*', r'because buy \1', s)
    
    # Replace any multiple spaces again
    s = re.sub(r'\s+', ' ', s).strip()
    return s

def main():
    file1 = r"C:\Users\srhsh\Documents\gemproject\compareactstock\_140_1340_4001.txt"
    file2 = r"C:\Users\srhsh\Documents\gemproject\compareactstock\_140_1657_4052.txt"

    lines1 = parse_file(file1)
    lines2 = parse_file(file2)

    print(f"File 1 ({file1}): Loaded {len(lines1)} summary/trade lines.")
    print(f"File 2 ({file2}): Loaded {len(lines2)} summary/trade lines.")

    idx1 = 0
    idx2 = 0
    mismatch_found = False
    
    while idx1 < len(lines1) and idx2 < len(lines2):
        item1 = lines1[idx1]
        item2 = lines2[idx2]
        
        c1 = item1['content']
        c2 = item2['content']
        
        type1 = item1['type']
        type2 = item2['type']
        
        # Clean them
        if type1 == 'SUMMARY':
            clean1 = clean_summary(c1)
        else:
            clean1 = clean_trade(c1)
            
        if type2 == 'SUMMARY':
            clean2 = clean_summary(c2)
        else:
            clean2 = clean_trade(c2)
            
        if clean1 == clean2:
            idx1 += 1
            idx2 += 1
            continue
            
        # If they are different types, let's report it
        if type1 != type2:
            print(f"\nType mismatch at File1[{idx1}] vs File2[{idx2}]:")
            print(f"File 1 (line {item1['orig_idx']}): Type={type1}, Content={c1}")
            print(f"File 2 (line {item2['orig_idx']}): Type={type2}, Content={c2}")
            mismatch_found = True
            break
            
        # Semantic difference
        print(f"\nFirst semantic difference at File1[{idx1}] vs File2[{idx2}]:")
        print(f"File 1 (line {item1['orig_idx']}):")
        print(f"  Raw:   {c1}")
        print(f"  Clean: {clean1}")
        print(f"File 2 (line {item2['orig_idx']}):")
        print(f"  Raw:   {c2}")
        print(f"  Clean: {clean2}")
        
        # Print context
        print("\nContext from File 1:")
        for j in range(max(0, idx1-3), min(len(lines1), idx1+6)):
            marker = "-->" if j == idx1 else "   "
            print(f"{marker} [{lines1[j]['orig_idx']}] {lines1[j]['content']}")
            
        print("\nContext from File 2:")
        for j in range(max(0, idx2-3), min(len(lines2), idx2+6)):
            marker = "-->" if j == idx2 else "   "
            print(f"{marker} [{lines2[j]['orig_idx']}] {lines2[j]['content']}")
            
        mismatch_found = True
        break
        
    if not mismatch_found:
        if len(lines1) != len(lines2):
            print(f"\nFinished comparison. No semantic mismatches found up to common limit. But file lengths differ: File1={len(lines1)}, File2={len(lines2)}")
            # Print the next few lines of the longer one
            if len(lines1) > len(lines2):
                print(f"Extra lines in File 1 starting at index {len(lines2)}:")
                for j in range(len(lines2), min(len(lines1), len(lines2)+5)):
                    print(f"  [{lines1[j]['orig_idx']}] {lines1[j]['content']}")
            else:
                print(f"Extra lines in File 2 starting at index {len(lines1)}:")
                for j in range(len(lines1), min(len(lines2), len(lines1)+5)):
                    print(f"  [{lines2[j]['orig_idx']}] {lines2[j]['content']}")
        else:
            print("\nSuccess! Files are semantically identical throughout.")

if __name__ == '__main__':
    main()
