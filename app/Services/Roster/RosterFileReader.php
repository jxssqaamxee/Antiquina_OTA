<?php

namespace App\Services\Roster;

use DOMDocument;
use DOMElement;
use DOMNode;
use DOMXPath;
use ZipArchive;

/**
 * Reads ANY roster file into plain "records" (one text line per row / paragraph, table cells joined by a tab),
 * so the parser only ever deals with text: txt, csv, tsv, md, json, html, rtf, xlsx/xlsm, docx, odt/ods, pptx
 * and text-based PDF. The file type is taken from the file's own first bytes first and the extension second,
 * so a renamed file still works. Nothing is stored or executed; the upload is only read.
 */
class RosterFileReader
{
    public const MAX_RECORDS = 20000;
    private const MAX_ENTRY_BYTES = 40 * 1024 * 1024; // zip-bomb guard: largest XML part we will inflate

    /** @return list<string> */
    public function records(string $path, string $originalName): array
    {
        if (! is_file($path) || ! is_readable($path) || filesize($path) === 0) {
            throw new RosterReadException('That file is empty or could not be read.');
        }

        $records = match ($this->kind($path, $originalName)) {
            'pdf' => $this->pdf($path),
            'xlsx' => $this->xlsx($path),
            'docx' => $this->wordLike($path, ['word/document.xml'], ['tr'], ['tc'], ['p']),
            'pptx' => $this->pptx($path),
            'odf' => $this->wordLike($path, ['content.xml'], ['table-row'], ['table-cell', 'covered-table-cell'], ['p', 'h']),
            'legacy' => throw new RosterReadException('Old Office files (.xls, .doc, .ppt) cannot be read. Open it and use Save As → .xlsx / .docx (or export to CSV), then upload that.'),
            'image' => throw new RosterReadException('A photo or scanned image cannot be read. Upload the list as Excel, Word, CSV, text or a text-based PDF.'),
            default => $this->text($path),
        };

        $records = array_values(array_filter(array_map(
            fn (string $r) => trim((string) preg_replace('/[ \x{00A0}]+/u', ' ', str_replace("\0", '', $r))),
            $records,
        ), fn (string $r) => $r !== ''));

        if (count($records) > self::MAX_RECORDS) {
            throw new RosterReadException('That file is too long (over '.self::MAX_RECORDS.' lines). Split it into smaller files.');
        }
        if ($records === []) {
            throw new RosterReadException('No readable text was found in that file.');
        }

        return $records;
    }

    private function kind(string $path, string $name): string
    {
        $head = (string) file_get_contents($path, false, null, 0, 8);
        $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));

        if (str_starts_with($head, '%PDF')) {
            return 'pdf';
        }
        if (str_starts_with($head, "\xD0\xCF\x11\xE0")) {
            return 'legacy';
        }
        if (str_starts_with($head, "\x89PNG") || str_starts_with($head, "\xFF\xD8\xFF") || str_starts_with($head, 'GIF8')
            || (str_starts_with($head, 'RIFF') && str_contains((string) file_get_contents($path, false, null, 8, 4), 'WEBP'))
            || in_array($ext, ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'bmp', 'tif', 'tiff'], true)) {
            return 'image';
        }
        if (str_starts_with($head, "PK\x03\x04")) {
            $zip = new ZipArchive();
            if ($zip->open($path) === true) {
                $kind = match (true) {
                    $zip->locateName('xl/workbook.xml') !== false => 'xlsx',
                    $zip->locateName('word/document.xml') !== false => 'docx',
                    $zip->locateName('ppt/presentation.xml') !== false => 'pptx',
                    $zip->locateName('content.xml') !== false && $zip->locateName('mimetype') !== false => 'odf',
                    default => null,
                };
                $zip->close();
                if ($kind) {
                    return $kind;
                }
            }
            throw new RosterReadException('That archive is not a Word, Excel, OpenDocument or PowerPoint file.');
        }
        // A ".xls" / ".doc" without the old Office signature is usually a CSV or HTML export: read it as text.
        return 'text';
    }

    // ---------------------------------------------------------------- plain text family

    /** @return list<string> */
    private function text(string $path): array
    {
        $raw = (string) file_get_contents($path);
        if (str_starts_with($raw, "\xFF\xFE")) {
            $raw = mb_convert_encoding(substr($raw, 2), 'UTF-8', 'UTF-16LE');
        } elseif (str_starts_with($raw, "\xFE\xFF")) {
            $raw = mb_convert_encoding(substr($raw, 2), 'UTF-8', 'UTF-16BE');
        } elseif (! mb_check_encoding($raw, 'UTF-8')) {
            $raw = mb_convert_encoding($raw, 'UTF-8', 'Windows-1252'); // Excel "CSV" saved on Windows
        }
        $raw = ltrim($raw, "\xEF\xBB\xBF");

        $trim = ltrim($raw);
        if (str_starts_with($trim, '{\rtf')) {
            $raw = $this->rtf($raw);
        } elseif (preg_match('/^<(!doctype html|html|\?xml)/i', $trim) || preg_match('/<\/(tr|td|table|p|div)>/i', $raw)) {
            $raw = $this->html($raw);
        } elseif (str_starts_with($trim, '{') || str_starts_with($trim, '[')) {
            $json = json_decode($raw, true);
            if (is_array($json)) {
                return $this->jsonRows($json);
            }
        }

        return preg_split('/\R/u', $raw) ?: [];
    }

    private function html(string $html): string
    {
        $html = preg_replace('#<(script|style)\b.*?</\1>#is', ' ', $html) ?? '';
        $html = preg_replace('#</t[dh]\s*>#i', "\t", $html) ?? '';
        $html = preg_replace('#</(tr|p|div|li|h[1-6])\s*>|<br\s*/?>#i', "\n", $html) ?? '';

        return html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    }

    private function rtf(string $rtf): string
    {
        $rtf = preg_replace_callback("/\\\\'([0-9a-f]{2})/i", fn ($m) => mb_convert_encoding(chr(hexdec($m[1])), 'UTF-8', 'Windows-1252'), $rtf) ?? '';
        $rtf = preg_replace('/\\\\(par|line)\b ?/', "\n", $rtf) ?? '';
        $rtf = preg_replace('/\\\\(tab|cell)\b ?/', "\t", $rtf) ?? '';
        $rtf = preg_replace('/\\\\row\b ?/', "\n", $rtf) ?? '';
        $rtf = preg_replace('/\{\\\\\*[^{}]*\}/', '', $rtf) ?? '';
        $rtf = preg_replace('/\\\\[a-z]+-?\d* ?/i', '', $rtf) ?? '';

        return str_replace(['{', '}', '\\'], '', $rtf);
    }

    /** @return list<string> */
    private function jsonRows(array $node): array
    {
        $out = [];
        $walk = function ($v) use (&$walk, &$out) {
            if (! is_array($v)) {
                return;
            }
            $scalars = array_filter($v, fn ($x) => is_scalar($x) || $x === null);
            if ($scalars && count($scalars) === count($v) && array_is_list($v) === false) {
                $out[] = implode("\t", array_map('strval', $scalars)); // one object = one row
                return;
            }
            foreach ($v as $child) {
                if (is_scalar($child) && array_is_list($v)) {
                    $out[] = (string) $child; // list of plain strings
                } else {
                    $walk($child);
                }
            }
        };
        $walk($node);

        return $out;
    }

    // ---------------------------------------------------------------- PDF

    /** @return list<string> */
    private function pdf(string $path): array
    {
        if (filesize($path) > $this->pdfMaxBytes()) {
            throw new RosterReadException('That PDF is too large to read. Upload the Excel / Word / CSV version, or split the list.');
        }
        $text = '';
        if (class_exists(\Smalot\PdfParser\Parser::class)) {
            try {
                $text = (new \Smalot\PdfParser\Parser())->parseFile($path)->getText();
            } catch (\Throwable) {
                $text = '';
            }
        }
        if (trim($text) === '') {
            $text = $this->pdftotext($path);
        }
        if (trim($text) === '') {
            if (! class_exists(\Smalot\PdfParser\Parser::class) && $this->pdftotextBinary() === null) {
                throw new RosterReadException('PDF reading is not set up on this server yet (ask the administrator to run "composer require smalot/pdfparser"). Meanwhile, upload the list as Excel, Word, CSV or text.');
            }
            throw new RosterReadException('No text could be read from that PDF. It is probably a scanned picture. Upload a text-based PDF, or the Excel / Word / CSV version.');
        }

        return preg_split('/\R/u', $text) ?: [];
    }

    protected function pdfMaxBytes(): int
    {
        return 10 * 1024 * 1024;
    }

    protected function pdfTimeoutSeconds(): float
    {
        return 10.0;
    }

    protected function pdftotextBinary(): ?string
    {
        if (! function_exists('proc_open')) {
            return null;
        }
        foreach (['/usr/bin/pdftotext', '/usr/local/bin/pdftotext', '/opt/homebrew/bin/pdftotext'] as $bin) {
            if (is_executable($bin)) {
                return $bin;
            }
        }

        return null;
    }

    private function pdftotext(string $path): string
    {
        $bin = $this->pdftotextBinary();
        if ($bin === null) {
            return '';
        }
        // Argument array: no shell, so the file name can never be interpreted as a command.
        $proc = @proc_open([$bin, '-layout', '-enc', 'UTF-8', $path, '-'], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        if (! is_resource($proc)) {
            return '';
        }
        stream_set_blocking($pipes[1], false);
        stream_set_blocking($pipes[2], false);
        $out = '';
        $limit = 20 * 1024 * 1024;
        $deadline = microtime(true) + $this->pdfTimeoutSeconds();
        $timedOut = false;
        while (true) {
            $read = array_filter([$pipes[1], $pipes[2]], fn ($p) => ! feof($p));
            if ($read === []) {
                break;
            }
            if (microtime(true) >= $deadline || strlen($out) > $limit) {
                $timedOut = true;
                break;
            }
            $w = $e = null;
            if (@stream_select($read, $w, $e, 0, 200000) > 0) {
                foreach ($read as $p) {
                    $chunk = (string) fread($p, 65536);
                    if ($p === $pipes[1]) {
                        $out .= $chunk;
                    }
                }
            }
        }
        if ($timedOut) {
            proc_terminate($proc, 9); // a hostile PDF must not hold a PHP worker forever
            $out = '';
        }
        fclose($pipes[1]);
        fclose($pipes[2]);
        proc_close($proc);

        return $out;
    }

    // ---------------------------------------------------------------- Office / OpenDocument (zip + XML)

    private function part(ZipArchive $zip, string $name): ?string
    {
        $stat = $zip->statName($name);
        if ($stat === false) {
            return null;
        }
        if ($stat['size'] > self::MAX_ENTRY_BYTES) {
            throw new RosterReadException('That file is too large to read.');
        }
        $xml = $zip->getFromName($name);

        return $xml === false ? null : $xml;
    }

    /**
     * Office / OpenDocument XML never needs a DOCTYPE or entity. The check runs on UTF-8 text AFTER the
     * encoding is normalised: a UTF-16 (or UTF-7) file hides the ASCII string "<!DOCTYPE" from a plain
     * search while libxml still honours it. Anything we cannot normalise with certainty is refused.
     */
    private function safeXml(string $xml): string
    {
        $unsafe = new RosterReadException('That file contains unsafe content and was refused.');
        $enc = null;
        if (str_starts_with($xml, "\xFF\xFE\x00\x00") || str_starts_with($xml, "\x00\x00\xFE\xFF")) {
            throw $unsafe; // UTF-32
        }
        if (str_starts_with($xml, "\xEF\xBB\xBF")) {
            $xml = substr($xml, 3);
        } elseif (str_starts_with($xml, "\xFF\xFE")) {
            $enc = 'UTF-16LE'; $xml = substr($xml, 2);
        } elseif (str_starts_with($xml, "\xFE\xFF")) {
            $enc = 'UTF-16BE'; $xml = substr($xml, 2);
        } elseif (preg_match('/^<\x00[\x00-\x7F]\x00/', $xml)) {
            $enc = 'UTF-16LE';
        } elseif (preg_match('/^\x00<\x00[\x00-\x7F]/', $xml)) {
            $enc = 'UTF-16BE';
        }
        if ($enc !== null) {
            $xml = (string) mb_convert_encoding($xml, 'UTF-8', $enc);
        }
        if (str_contains($xml, "\0")) {
            throw $unsafe; // NUL bytes in UTF-8 text: an encoding we did not recognise
        }
        // Only ASCII-compatible encodings that libxml reads the same way we searched.
        if (preg_match('/^\s*<\?xml[^>]*?encoding\s*=\s*(["\'])([^"\']*)\1/i', $xml, $m)) {
            $declared = strtolower($m[2]);
            if (! in_array($declared, ['utf-8', 'utf8', 'us-ascii', 'ascii', 'iso-8859-1', 'windows-1252', 'utf-16', 'utf-16le', 'utf-16be'], true)) {
                throw $unsafe;
            }
            // Already UTF-8 now, so the declaration must say so.
            $xml = preg_replace('/^(\s*<\?xml[^>]*?encoding\s*=\s*)(["\'])[^"\']*\2/i', '$1"UTF-8"', $xml, 1) ?? $xml;
        }
        if (stripos($xml, '<!DOCTYPE') !== false || stripos($xml, '<!ENTITY') !== false) {
            throw $unsafe;
        }

        return $xml;
    }

    private function dom(string $xml): DOMDocument
    {
        $xml = $this->safeXml($xml);
        $dom = new DOMDocument();
        // No LIBXML_PARSEHUGE: libxml's own depth / text-node limits stay on. The zip entry size is capped above.
        if (! @$dom->loadXML($xml, LIBXML_NONET | LIBXML_COMPACT)) {
            throw new RosterReadException('That file looks damaged and could not be read.');
        }

        return $dom;
    }

    /** @return list<string> */
    private function xlsx(string $path): array
    {
        $zip = new ZipArchive();
        if ($zip->open($path) !== true) {
            throw new RosterReadException('That Excel file could not be opened.');
        }
        try {
            $shared = [];
            if (($xml = $this->part($zip, 'xl/sharedStrings.xml')) !== null) {
                $dom = $this->dom($xml);
                foreach ($dom->getElementsByTagNameNS('*', 'si') as $si) {
                    $shared[] = $this->nodeText($si, ['t']);
                }
            }

            $sheets = [];
            for ($i = 0; $i < $zip->numFiles; $i++) {
                $n = $zip->getNameIndex($i);
                if (preg_match('#^xl/worksheets/[^/]+\.xml$#', (string) $n)) {
                    $sheets[] = $n;
                }
            }
            natsort($sheets);

            $records = [];
            foreach ($sheets as $sheet) {
                $dom = $this->dom((string) $this->part($zip, $sheet));
                foreach ($dom->getElementsByTagNameNS('*', 'row') as $row) {
                    $cells = [];
                    foreach ($row->childNodes as $c) {
                        if (! $c instanceof DOMElement || $c->localName !== 'c') {
                            continue;
                        }
                        $type = $c->getAttribute('t');
                        $v = '';
                        foreach ($c->childNodes as $k) {
                            if ($k instanceof DOMElement && $k->localName === 'v') {
                                $v = $k->textContent;
                            } elseif ($k instanceof DOMElement && $k->localName === 'is') {
                                $v = $this->nodeText($k, ['t']);
                            }
                        }
                        $cells[] = $type === 's' ? ($shared[(int) $v] ?? '') : $v;
                    }
                    $records[] = implode("\t", $cells);
                    if (count($records) > self::MAX_RECORDS + 1) {
                        return $records;
                    }
                }
            }

            return $records;
        } finally {
            $zip->close();
        }
    }

    /** @return list<string> */
    private function pptx(string $path): array
    {
        $zip = new ZipArchive();
        if ($zip->open($path) !== true) {
            throw new RosterReadException('That PowerPoint file could not be opened.');
        }
        $slides = [];
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $n = $zip->getNameIndex($i);
            if (preg_match('#^ppt/slides/slide\d+\.xml$#', (string) $n)) {
                $slides[] = $n;
            }
        }
        $zip->close();
        natsort($slides);

        $records = [];
        foreach ($slides as $s) {
            $records = array_merge($records, $this->wordLike($path, [$s], ['tr'], ['tc'], ['p']));
        }

        return $records;
    }

    /**
     * Generic walker for XML documents made of rows (tables) and paragraphs, in document order.
     * A table row becomes one tab-joined record; any other paragraph becomes one record.
     *
     * @param  list<string>  $parts   XML files inside the zip
     * @param  list<string>  $rowTags local names of table rows
     * @return list<string>
     */
    private function wordLike(string $path, array $parts, array $rowTags, array $cellTags, array $paraTags): array
    {
        $zip = new ZipArchive();
        if ($zip->open($path) !== true) {
            throw new RosterReadException('That file could not be opened.');
        }
        $records = [];
        try {
            foreach ($parts as $part) {
                $xml = $this->part($zip, $part);
                if ($xml === null) {
                    continue;
                }
                $this->walk($this->dom($xml)->documentElement, $rowTags, $cellTags, $paraTags, $records);
            }
        } finally {
            $zip->close();
        }

        return $records;
    }

    /** @param  list<string>  $records */
    private function walk(?DOMNode $node, array $rowTags, array $cellTags, array $paraTags, array &$records): void
    {
        if ($node === null) {
            return;
        }
        foreach ($node->childNodes as $child) {
            if (! $child instanceof DOMElement) {
                continue;
            }
            if (in_array($child->localName, $rowTags, true)) {
                $cells = [];
                foreach ($child->childNodes as $cell) {
                    if ($cell instanceof DOMElement && in_array($cell->localName, $cellTags, true)) {
                        $cells[] = trim($this->plain($cell));
                    }
                }
                $records[] = implode("\t", $cells);
            } elseif (in_array($child->localName, $paraTags, true)) {
                $records[] = $this->plain($child);
            } else {
                $this->walk($child, $rowTags, $cellTags, $paraTags, $records);
            }
        }
    }

    /** Text of a node; tabs / breaks / spaces inside runs become a space so words do not stick together. */
    private function plain(DOMNode $node): string
    {
        $out = '';
        foreach ($node->childNodes as $c) {
            if ($c instanceof DOMElement) {
                $out .= in_array($c->localName, ['tab', 'br', 'cr', 's', 'line-break'], true) ? ' ' : $this->plain($c);
                if (in_array($c->localName, ['p', 'h'], true)) {
                    $out .= ' '; // paragraph inside a cell
                }
            } else {
                $out .= $c->nodeValue;
            }
        }

        return $out;
    }

    /** Joined text of the descendants with these local names (shared strings, inline strings). */
    private function nodeText(DOMElement $node, array $tags): string
    {
        $xp = new DOMXPath($node->ownerDocument);
        $out = '';
        foreach ($xp->query('.//*', $node) ?: [] as $el) {
            if ($el instanceof DOMElement && in_array($el->localName, $tags, true) && $el->parentNode?->localName !== 'rPh') {
                $out .= $el->textContent;
            }
        }

        return $out;
    }
}
