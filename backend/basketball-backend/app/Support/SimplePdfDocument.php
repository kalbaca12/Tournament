<?php

namespace App\Support;

class SimplePdfDocument
{
    private const PAGE_WIDTH = 595.28;

    private const PAGE_HEIGHT = 841.89;

    private const MARGIN = 42.0;

    /**
     * @var array<int, array<int, string>>
     */
    private array $pages = [];

    private int $pageIndex = -1;

    private float $cursorY = 0.0;

    public function __construct()
    {
        $this->beginPage();
    }

    public function addTitle(string $text): void
    {
        $this->addLine($text, 18, true);
        $this->addBlankLine(8);
    }

    public function addBanner(string $eyebrow, string $title, string $subtitle, array $tags = []): void
    {
        $eyebrow = $this->normalizeText($eyebrow);
        $title = $this->normalizeText($title);
        $subtitle = $this->normalizeText($subtitle);
        $tags = array_values(array_filter(array_map(fn (mixed $tag) => $this->normalizeText((string) $tag), $tags)));

        $height = 92 + ($tags === [] ? 0 : 24);
        $this->ensureSpace($height + 12);

        $top = $this->cursorY;
        $bottom = $top - $height;
        $width = $this->usableWidth();

        $this->drawFilledRect(self::MARGIN, $bottom, $width, $height, [0.09, 0.13, 0.20]);
        $this->drawFilledRect(self::MARGIN, $bottom + $height - 8, $width, 8, [0.96, 0.65, 0.25]);

        $textX = self::MARGIN + 18;
        $this->drawText($textX, $top - 24, $eyebrow, 9, true, [0.96, 0.65, 0.25]);
        $this->drawText($textX, $top - 50, $title, 21, true, [1, 1, 1]);
        $this->drawText($textX, $top - 70, $subtitle, 10, false, [0.85, 0.90, 0.97]);

        if ($tags !== []) {
            $chipX = $textX;
            $chipY = $bottom + 12;
            foreach ($tags as $tag) {
                $chipWidth = max(48.0, $this->estimateTextWidth($tag, 8, true) + 18);
                if (($chipX + $chipWidth) > (self::PAGE_WIDTH - self::MARGIN)) {
                    break;
                }

                $this->drawFilledRect($chipX, $chipY, $chipWidth, 14, [0.19, 0.28, 0.40]);
                $this->drawText($chipX + 9, $chipY + 4, $tag, 8, true, [1, 1, 1]);
                $chipX += $chipWidth + 8;
            }
        }

        $this->cursorY = $bottom - 16;
    }

    public function addSection(string $text, ?string $subtitle = null): void
    {
        $this->addBlankLine(10);
        $this->ensureSpace($subtitle ? 28 : 20);
        $this->drawText(self::MARGIN, $this->cursorY, $text, 14, true, [0.08, 0.15, 0.26]);
        if ($subtitle) {
            $this->drawText(self::MARGIN, $this->cursorY - 13, $subtitle, 9, false, [0.40, 0.47, 0.56]);
            $this->cursorY -= 13;
        }
        $this->cursorY -= 16;
        $this->drawRule([0.84, 0.88, 0.92]);
        $this->cursorY -= 16;
    }

    public function addStatsGrid(array $cards, int $columns = 3): void
    {
        $cards = array_values(array_filter($cards, fn ($card) => is_array($card) && isset($card['label'], $card['value'])));
        if ($cards === []) {
            return;
        }

        $columns = max(1, min($columns, 3));
        $gap = 10.0;
        $cardWidth = ($this->usableWidth() - (($columns - 1) * $gap)) / $columns;
        $cardHeight = 64.0;
        $rows = array_chunk($cards, $columns);

        foreach ($rows as $row) {
            $this->ensureSpace($cardHeight + 10);
            $top = $this->cursorY;
            foreach ($row as $index => $card) {
                $x = self::MARGIN + ($index * ($cardWidth + $gap));
                $bottom = $top - $cardHeight;
                $this->drawFilledRect($x, $bottom, $cardWidth, $cardHeight, [0.95, 0.97, 0.99]);
                $this->drawStrokedRect($x, $bottom, $cardWidth, $cardHeight, [0.86, 0.90, 0.94], 0.8);
                $this->drawText($x + 12, $top - 16, (string) $card['label'], 8, true, [0.42, 0.49, 0.57]);
                $valueLines = $this->wrapTextToWidth((string) $card['value'], $cardWidth - 24, 13, true, 2);
                $valueY = $top - 33;
                foreach ($valueLines as $line) {
                    $this->drawText($x + 12, $valueY, $line, 13, true, [0.10, 0.16, 0.25]);
                    $valueY -= 13;
                }
                if (!empty($card['meta'])) {
                    $meta = $this->truncateToWidth((string) $card['meta'], $cardWidth - 24, 8, false);
                    $this->drawText($x + 12, $bottom + 9, $meta, 8, false, [0.42, 0.49, 0.57]);
                }
            }
            $this->cursorY -= $cardHeight + 10;
        }
    }

    public function addLine(string $text, int $fontSize = 10, bool $bold = false, int $indent = 0, ?array $color = null): void
    {
        $text = $this->normalizeText($text);
        if ($text === '') {
            $this->addBlankLine();

            return;
        }

        $lineHeight = max(12.0, $fontSize * 1.35);
        $x = self::MARGIN + $indent;
        $usableWidth = self::PAGE_WIDTH - self::MARGIN - $x;
        $maxChars = max(12, (int) floor($usableWidth / ($fontSize * 0.56)));
        $lines = preg_split('/\r?\n/', wordwrap($text, $maxChars, "\n", true)) ?: [];

        foreach ($lines as $line) {
            $this->ensureSpace($lineHeight);
            $this->drawText($x, $this->cursorY, $line, $fontSize, $bold, $color ?? [0.16, 0.20, 0.26]);
            $this->cursorY -= $lineHeight;
        }
    }

    public function addBulletList(array $items, int $fontSize = 10): void
    {
        foreach ($items as $item) {
            $this->addLine('• ' . (string) $item, $fontSize, false, 8);
        }
    }

    public function addNoteBox(string $text): void
    {
        $text = $this->normalizeText($text);
        $lines = preg_split('/\r?\n/', wordwrap($text, 86, "\n", true)) ?: [];
        $height = (count($lines) * 12.0) + 18.0;
        $this->ensureSpace($height + 8);

        $top = $this->cursorY;
        $bottom = $top - $height;
        $this->drawFilledRect(self::MARGIN, $bottom, $this->usableWidth(), $height, [0.98, 0.99, 1.00]);
        $this->drawStrokedRect(self::MARGIN, $bottom, $this->usableWidth(), $height, [0.86, 0.90, 0.94], 0.8);

        $textY = $top - 16;
        foreach ($lines as $line) {
            $this->drawText(self::MARGIN + 12, $textY, $line, 9, false, [0.34, 0.40, 0.48]);
            $textY -= 12;
        }

        $this->cursorY = $bottom - 10;
    }

    public function addTable(array $columns, array $rows, array $options = []): void
    {
        if ($columns === []) {
            return;
        }

        $fontSize = (float) ($options['font_size'] ?? 8.5);
        $rowHeight = (float) ($options['row_height'] ?? 18.0);
        $headerHeight = (float) ($options['header_height'] ?? 20.0);
        $footer = $options['footer'] ?? null;
        $x = self::MARGIN;
        $widths = $this->resolveColumnWidths($columns);

        $drawHeader = function () use ($columns, $widths, $headerHeight, $fontSize, $x): void {
            $this->ensureSpace($headerHeight + 6);
            $top = $this->cursorY;
            $bottom = $top - $headerHeight;
            $this->drawFilledRect($x, $bottom, array_sum($widths), $headerHeight, [0.11, 0.18, 0.28]);
            $cursorX = $x;
            foreach ($columns as $index => $column) {
                $this->drawText($cursorX + 6, $top - 14, (string) ($column['label'] ?? ''), $fontSize, true, [1, 1, 1]);
                $cursorX += $widths[$index];
            }
            $this->cursorY = $bottom;
        };

        $drawHeader();

        foreach ($rows as $rowIndex => $row) {
            if (($this->cursorY - $rowHeight) < self::MARGIN) {
                $this->beginPage();
                $drawHeader();
            }

            $top = $this->cursorY;
            $bottom = $top - $rowHeight;
            $fill = $rowIndex % 2 === 0 ? [0.98, 0.99, 1.00] : [0.95, 0.97, 0.99];
            $this->drawFilledRect($x, $bottom, array_sum($widths), $rowHeight, $fill);
            $this->drawHorizontalLine($x, $bottom, $x + array_sum($widths), [0.88, 0.91, 0.95], 0.5);

            $cursorX = $x;
            foreach ($columns as $index => $column) {
                $value = $row[$column['key']] ?? '';
                $align = $column['align'] ?? 'left';
                $text = $this->truncateToWidth((string) $value, $widths[$index] - 12, $fontSize, false);
                $textWidth = $this->estimateTextWidth($text, $fontSize, false);
                $textX = $align === 'right'
                    ? ($cursorX + $widths[$index] - 6 - $textWidth)
                    : ($cursorX + 6);

                $this->drawText($textX, $top - 13, $text, $fontSize, false, [0.18, 0.22, 0.29]);
                $cursorX += $widths[$index];
            }

            $this->cursorY = $bottom;
        }

        if (is_array($footer)) {
            if (($this->cursorY - $rowHeight) < self::MARGIN) {
                $this->beginPage();
                $drawHeader();
            }

            $top = $this->cursorY;
            $bottom = $top - $rowHeight;
            $this->drawFilledRect($x, $bottom, array_sum($widths), $rowHeight, [0.90, 0.94, 0.98]);
            $this->drawHorizontalLine($x, $top, $x + array_sum($widths), [0.72, 0.78, 0.86], 0.9);

            $cursorX = $x;
            foreach ($columns as $index => $column) {
                $value = $footer[$column['key']] ?? '';
                $align = $column['align'] ?? 'left';
                $text = $this->truncateToWidth((string) $value, $widths[$index] - 12, $fontSize, true);
                $textWidth = $this->estimateTextWidth($text, $fontSize, true);
                $textX = $align === 'right'
                    ? ($cursorX + $widths[$index] - 6 - $textWidth)
                    : ($cursorX + 6);

                $this->drawText($textX, $top - 13, $text, $fontSize, true, [0.10, 0.16, 0.25]);
                $cursorX += $widths[$index];
            }

            $this->cursorY = $bottom;
        }

        $this->drawStrokedRect($x, $this->cursorY, array_sum($widths), $headerHeight + (count($rows) * $rowHeight) + (is_array($footer) ? $rowHeight : 0), [0.82, 0.87, 0.92], 0.8, true);
        $this->cursorY -= 18;
    }

    public function addBracketDiagram(array $rounds, array $options = []): void
    {
        $rounds = array_values(array_filter($rounds, fn ($round) => is_array($round) && !empty($round['matches'])));
        if ($rounds === []) {
            return;
        }

        $roundCount = count($rounds);
        $firstRoundCount = max(array_map(
            fn (array $round) => count($round['matches'] ?? []),
            $rounds,
        ));

        $titleHeight = 26.0;
        $cardHeight = (float) ($options['card_height'] ?? 70.0);
        $slotHeight = $firstRoundCount >= 4 ? 82.0 : 92.0;
        $columnGap = $roundCount >= 4 ? 12.0 : 16.0;
        $cardWidth = ($this->usableWidth() - (($roundCount - 1) * $columnGap)) / max(1, $roundCount);
        $cardWidth = max(104.0, min(156.0, $cardWidth));
        $layoutWidth = ($roundCount * $cardWidth) + (($roundCount - 1) * $columnGap);
        $xStart = self::MARGIN + (($this->usableWidth() - $layoutWidth) / 2);
        $totalHeight = $titleHeight + 12.0 + $cardHeight + max(0, $firstRoundCount - 1) * $slotHeight + 12.0;

        $this->ensureSpace($totalHeight + 10.0);

        $titleTop = $this->cursorY;
        $firstCardTop = $titleTop - $titleHeight - 10.0;

        $xPositions = [];
        for ($index = 0; $index < $roundCount; $index++) {
            $xPositions[$index] = $xStart + ($index * ($cardWidth + $columnGap));
        }

        foreach ($rounds as $roundIndex => $round) {
            $this->drawBracketRoundTitle(
                $xPositions[$roundIndex],
                $titleTop - $titleHeight,
                $cardWidth,
                $titleHeight,
                (string) ($round['title'] ?? ('Round ' . ($roundIndex + 1))),
            );
        }

        $centersByRound = [];
        $openingMatchCount = count($rounds[0]['matches']);
        for ($matchIndex = 0; $matchIndex < $openingMatchCount; $matchIndex++) {
            $centersByRound[0][$matchIndex] = $firstCardTop - ($cardHeight / 2) - ($matchIndex * $slotHeight);
        }

        for ($roundIndex = 1; $roundIndex < $roundCount; $roundIndex++) {
            $centersByRound[$roundIndex] = [];
            $matchCount = count($rounds[$roundIndex]['matches']);
            for ($matchIndex = 0; $matchIndex < $matchCount; $matchIndex++) {
                $topChild = $centersByRound[$roundIndex - 1][$matchIndex * 2] ?? null;
                $bottomChild = $centersByRound[$roundIndex - 1][$matchIndex * 2 + 1] ?? null;

                if ($topChild !== null && $bottomChild !== null) {
                    $centersByRound[$roundIndex][$matchIndex] = ($topChild + $bottomChild) / 2;
                } elseif ($topChild !== null) {
                    $centersByRound[$roundIndex][$matchIndex] = $topChild;
                } elseif ($bottomChild !== null) {
                    $centersByRound[$roundIndex][$matchIndex] = $bottomChild;
                }
            }
        }

        foreach ($rounds as $roundIndex => $round) {
            if ($roundIndex > 0) {
                foreach ($round['matches'] as $matchIndex => $_match) {
                    $leftCenterTop = $centersByRound[$roundIndex - 1][$matchIndex * 2] ?? null;
                    $leftCenterBottom = $centersByRound[$roundIndex - 1][$matchIndex * 2 + 1] ?? null;
                    $rightCenter = $centersByRound[$roundIndex][$matchIndex] ?? null;

                    if ($rightCenter === null) {
                        continue;
                    }

                    $connectorX = $xPositions[$roundIndex] - ($columnGap / 2);
                    $previousX = $xPositions[$roundIndex - 1] + $cardWidth;

                    if ($leftCenterTop !== null) {
                        $this->drawHorizontalLine($previousX, $leftCenterTop, $connectorX, [0.73, 0.79, 0.86], 1.2);
                    }
                    if ($leftCenterBottom !== null) {
                        $this->drawHorizontalLine($previousX, $leftCenterBottom, $connectorX, [0.73, 0.79, 0.86], 1.2);
                    }
                    if ($leftCenterTop !== null && $leftCenterBottom !== null) {
                        $this->drawVerticalLine($connectorX, min($leftCenterTop, $leftCenterBottom), max($leftCenterTop, $leftCenterBottom), [0.73, 0.79, 0.86], 1.2);
                    }
                    $this->drawHorizontalLine($connectorX, $rightCenter, $xPositions[$roundIndex], [0.73, 0.79, 0.86], 1.2);
                }
            }

            foreach ($round['matches'] as $matchIndex => $match) {
                $center = $centersByRound[$roundIndex][$matchIndex] ?? null;
                if ($center === null) {
                    continue;
                }

                $this->drawBracketMatchCard(
                    $xPositions[$roundIndex],
                    $center,
                    $cardWidth,
                    $cardHeight,
                    $match,
                );
            }
        }

        $this->cursorY -= $totalHeight + 8.0;
    }

    public function addBlankLine(float $height = 6.0): void
    {
        $this->ensureSpace($height);
        $this->cursorY -= $height;
    }

    public function addRule(): void
    {
        $this->ensureSpace(12.0);
        $this->drawRule([0.84, 0.88, 0.92]);
        $this->cursorY -= 12.0;
    }

    public function remainingHeight(): float
    {
        return $this->cursorY - self::MARGIN;
    }

    public function contentHeight(): float
    {
        return self::PAGE_HEIGHT - (self::MARGIN * 2);
    }

    public function newPage(): void
    {
        $this->beginPage();
    }

    public function output(): string
    {
        $this->appendFooters();

        $objects = [
            1 => '<< /Type /Catalog /Pages 2 0 R >>',
            2 => '',
            3 => '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
            4 => '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
        ];

        $pageRefs = [];
        foreach ($this->pages as $pageCommands) {
            $content = implode("\n", $pageCommands);
            $contentId = count($objects) + 1;
            $objects[$contentId] = "<< /Length " . strlen($content) . " >>\nstream\n{$content}\nendstream";

            $pageId = count($objects) + 1;
            $objects[$pageId] = sprintf(
                '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %.2F %.2F] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents %d 0 R >>',
                self::PAGE_WIDTH,
                self::PAGE_HEIGHT,
                $contentId,
            );

            $pageRefs[] = "{$pageId} 0 R";
        }

        $objects[2] = '<< /Type /Pages /Count ' . count($pageRefs) . ' /Kids [ ' . implode(' ', $pageRefs) . ' ] >>';

        ksort($objects);

        $pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
        $offsets = [0];

        foreach ($objects as $id => $content) {
            $offsets[$id] = strlen($pdf);
            $pdf .= "{$id} 0 obj\n{$content}\nendobj\n";
        }

        $xrefOffset = strlen($pdf);
        $pdf .= "xref\n0 " . (count($objects) + 1) . "\n";
        $pdf .= "0000000000 65535 f \n";

        for ($id = 1; $id <= count($objects); $id++) {
            $pdf .= sprintf("%010d 00000 n \n", $offsets[$id]);
        }

        $pdf .= "trailer\n<< /Size " . (count($objects) + 1) . " /Root 1 0 R >>\n";
        $pdf .= "startxref\n{$xrefOffset}\n%%EOF";

        return $pdf;
    }

    private function beginPage(): void
    {
        $this->pages[] = [];
        $this->pageIndex = count($this->pages) - 1;
        $this->cursorY = self::PAGE_HEIGHT - self::MARGIN;
    }

    private function usableWidth(): float
    {
        return self::PAGE_WIDTH - (self::MARGIN * 2);
    }

    private function ensureSpace(float $height): void
    {
        if (($this->cursorY - $height) < self::MARGIN) {
            $this->beginPage();
        }
    }

    private function addCommand(string $command): void
    {
        $this->pages[$this->pageIndex][] = $command;
    }

    private function drawText(float $x, float $y, string $text, float $size, bool $bold = false, array $color = [0, 0, 0]): void
    {
        $text = $this->normalizeText($text);
        if ($text === '') {
            return;
        }

        $this->addCommand(sprintf(
            'q %.3F %.3F %.3F rg BT /%s %.2F Tf %.2F %.2F Td (%s) Tj ET Q',
            $color[0],
            $color[1],
            $color[2],
            $bold ? 'F2' : 'F1',
            $size,
            $x,
            $y,
            $this->escapePdfText($text),
        ));
    }

    private function drawFilledRect(float $x, float $y, float $width, float $height, array $color): void
    {
        $this->addCommand(sprintf(
            'q %.3F %.3F %.3F rg %.2F %.2F %.2F %.2F re f Q',
            $color[0],
            $color[1],
            $color[2],
            $x,
            $y,
            $width,
            $height,
        ));
    }

    private function drawStrokedRect(float $x, float $y, float $width, float $height, array $color, float $lineWidth = 1.0, bool $fromBottom = false): void
    {
        $rectY = $fromBottom ? $y : ($y);
        $this->addCommand(sprintf(
            'q %.3F %.3F %.3F RG %.2F w %.2F %.2F %.2F %.2F re S Q',
            $color[0],
            $color[1],
            $color[2],
            $lineWidth,
            $x,
            $rectY,
            $width,
            $height,
        ));
    }

    private function drawHorizontalLine(float $x1, float $y, float $x2, array $color, float $lineWidth = 0.8): void
    {
        $this->addCommand(sprintf(
            'q %.3F %.3F %.3F RG %.2F w %.2F %.2F m %.2F %.2F l S Q',
            $color[0],
            $color[1],
            $color[2],
            $lineWidth,
            $x1,
            $y,
            $x2,
            $y,
        ));
    }

    private function drawVerticalLine(float $x, float $y1, float $y2, array $color, float $lineWidth = 0.8): void
    {
        $this->addCommand(sprintf(
            'q %.3F %.3F %.3F RG %.2F w %.2F %.2F m %.2F %.2F l S Q',
            $color[0],
            $color[1],
            $color[2],
            $lineWidth,
            $x,
            $y1,
            $x,
            $y2,
        ));
    }

    private function drawRule(array $color): void
    {
        $this->drawHorizontalLine(self::MARGIN, $this->cursorY, self::PAGE_WIDTH - self::MARGIN, $color, 1.0);
    }

    private function appendFooters(): void
    {
        $total = count($this->pages);
        foreach ($this->pages as $index => &$pageCommands) {
            $pageNumber = 'Page ' . ($index + 1) . ' / ' . $total;
            $pageCommands[] = sprintf(
                'q 0.600 0.650 0.720 rg BT /F1 8 Tf %.2F %.2F Td (%s) Tj ET Q',
                self::PAGE_WIDTH - 92,
                22.0,
                $this->escapePdfText($pageNumber),
            );
            $pageCommands[] = sprintf(
                'q 0.860 0.890 0.930 RG 0.80 w %.2F %.2F m %.2F %.2F l S Q',
                self::MARGIN,
                30.0,
                self::PAGE_WIDTH - self::MARGIN,
                30.0,
            );
        }
        unset($pageCommands);
    }

    private function resolveColumnWidths(array $columns): array
    {
        $widths = [];
        $remaining = $this->usableWidth();
        $flexColumns = 0;

        foreach ($columns as $column) {
            if (isset($column['width'])) {
                $widths[] = (float) $column['width'];
                $remaining -= (float) $column['width'];
            } else {
                $widths[] = null;
                $flexColumns++;
            }
        }

        $flexWidth = $flexColumns > 0 ? max(32.0, $remaining / $flexColumns) : 32.0;
        foreach ($widths as $index => $width) {
            if ($width === null) {
                $widths[$index] = $flexWidth;
            }
        }

        return $widths;
    }

    private function estimateTextWidth(string $text, float $fontSize, bool $bold): float
    {
        $factor = $bold ? 0.54 : 0.52;

        return strlen($this->normalizeText($text)) * $fontSize * $factor;
    }

    private function truncateToWidth(string $text, float $maxWidth, float $fontSize, bool $bold): string
    {
        $text = $this->normalizeText($text);
        if ($this->estimateTextWidth($text, $fontSize, $bold) <= $maxWidth) {
            return $text;
        }

        while (strlen($text) > 4 && $this->estimateTextWidth($text . '...', $fontSize, $bold) > $maxWidth) {
            $text = substr($text, 0, -1);
        }

        return rtrim($text) . '...';
    }

    /**
     * @return array<int, string>
     */
    private function wrapTextToWidth(string $text, float $maxWidth, float $fontSize, bool $bold, int $maxLines = 2): array
    {
        $text = $this->normalizeText($text);
        if ($text === '') {
            return [''];
        }

        $words = preg_split('/\s+/', $text) ?: [];
        $lines = [];
        $current = '';

        foreach ($words as $word) {
            $candidate = $current === '' ? $word : ($current . ' ' . $word);
            if ($this->estimateTextWidth($candidate, $fontSize, $bold) <= $maxWidth) {
                $current = $candidate;
                continue;
            }

            if ($current !== '') {
                $lines[] = $current;
                $current = $word;
            } else {
                $lines[] = $this->truncateToWidth($word, $maxWidth, $fontSize, $bold);
                $current = '';
            }

            if (count($lines) >= ($maxLines - 1)) {
                break;
            }
        }

        if ($current !== '') {
            $lines[] = $current;
        }

        if (count($lines) > $maxLines) {
            $lines = array_slice($lines, 0, $maxLines);
        }

        if (count($lines) === $maxLines) {
            $lastIndex = count($lines) - 1;
            $lines[$lastIndex] = $this->truncateToWidth($lines[$lastIndex], $maxWidth, $fontSize, $bold);
        }

        return $lines;
    }

    private function normalizeText(string $text): string
    {
        $text = str_replace(["\r\n", "\r"], "\n", trim($text));
        $lines = preg_split('/\n/', $text) ?: [];
        $normalized = array_map(function (string $line): string {
            $line = preg_replace('/\s+/', ' ', trim($line)) ?? '';
            if ($line === '') {
                return '';
            }

            $converted = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $line);
            if ($converted === false) {
                $converted = preg_replace('/[^\x20-\x7E]/', '', $line) ?? '';
            }

            return trim($converted);
        }, $lines);

        return implode("\n", $normalized);
    }

    private function drawBracketRoundTitle(float $x, float $y, float $width, float $height, string $title): void
    {
        $this->drawFilledRect($x, $y, $width, $height, [0.11, 0.18, 0.28]);
        $this->drawFilledRect($x, $y + $height - 4.0, $width, 4.0, [0.96, 0.65, 0.25]);
        $this->drawText($x + 8.0, $y + 8.0, $this->truncateToWidth($title, $width - 16.0, 9.0, true), 9.0, true, [1, 1, 1]);
    }

    private function drawBracketMatchCard(float $x, float $centerY, float $width, float $height, array $match): void
    {
        $bottom = $centerY - ($height / 2);
        $top = $centerY + ($height / 2);
        $status = (string) ($match['status'] ?? 'scheduled');
        [$badgeFill, $badgeText] = $this->bracketStatusPalette($status);

        $this->drawFilledRect($x, $bottom, $width, $height, [0.985, 0.99, 1.0]);
        $this->drawStrokedRect($x, $bottom, $width, $height, [0.82, 0.87, 0.92], 0.8);

        $metaText = $this->truncateToWidth((string) ($match['meta'] ?? ''), $width - 76.0, 7.5, true);
        $this->drawText($x + 8.0, $top - 12.0, $metaText, 7.5, true, [0.31, 0.37, 0.45]);

        $badgeWidth = max(42.0, $this->estimateTextWidth($status, 6.5, true) + 14.0);
        $badgeX = $x + $width - $badgeWidth - 8.0;
        $badgeBottom = $top - 16.0;
        $this->drawFilledRect($badgeX, $badgeBottom, $badgeWidth, 10.0, $badgeFill);
        $this->drawText($badgeX + 6.0, $badgeBottom + 2.0, strtoupper($status), 6.5, true, $badgeText);

        $rowHeight = 14.0;
        $footerLineY = $bottom + 12.0;
        $secondRowBottom = $footerLineY + 6.0;
        $firstRowBottom = $secondRowBottom + $rowHeight + 5.0;

        $this->drawBracketTeamRow(
            $x + 8.0,
            $firstRowBottom,
            $width - 16.0,
            $rowHeight,
            (string) ($match['top_label'] ?? 'TBD'),
            (string) ($match['top_score'] ?? '-'),
            !empty($match['top_winner']),
        );

        $this->drawBracketTeamRow(
            $x + 8.0,
            $secondRowBottom,
            $width - 16.0,
            $rowHeight,
            (string) ($match['bottom_label'] ?? 'TBD'),
            (string) ($match['bottom_score'] ?? '-'),
            !empty($match['bottom_winner']),
        );

        $this->drawHorizontalLine($x + 8.0, $footerLineY, $x + $width - 8.0, [0.88, 0.91, 0.95], 0.7);
        $footerText = $this->truncateToWidth((string) ($match['footer'] ?? ''), $width - 16.0, 6.8, false);
        $this->drawText($x + 8.0, $bottom + 3.5, $footerText, 6.8, false, [0.43, 0.49, 0.57]);
    }

    private function drawBracketTeamRow(float $x, float $y, float $width, float $height, string $label, string $score, bool $isWinner): void
    {
        $fill = $isWinner ? [0.93, 0.99, 0.95] : [0.965, 0.976, 0.988];
        $this->drawFilledRect($x, $y, $width, $height, $fill);
        if ($isWinner) {
            $this->drawFilledRect($x, $y, 3.0, $height, [0.13, 0.77, 0.37]);
        }

        $scoreWidth = max(18.0, $this->estimateTextWidth($score, 8.0, true));
        $nameWidth = max(22.0, $width - $scoreWidth - 14.0);
        $name = $this->truncateToWidth($label, $nameWidth, 7.8, true);
        $scoreTextX = $x + $width - $scoreWidth - 6.0;
        $this->drawText($x + 6.0, $y + 4.0, $name, 7.8, true, [0.10, 0.16, 0.25]);
        $this->drawText($scoreTextX, $y + 4.0, $score, 8.0, true, [0.20, 0.27, 0.36]);
    }

    private function bracketStatusPalette(string $status): array
    {
        return match (strtolower($status)) {
            'live' => [[1.0, 0.945, 0.84], [0.63, 0.38, 0.03]],
            'finished' => [[0.91, 0.98, 0.93], [0.08, 0.40, 0.20]],
            'cancelled' => [[0.996, 0.90, 0.90], [0.72, 0.12, 0.12]],
            default => [[0.91, 0.94, 0.97], [0.18, 0.33, 0.47]],
        };
    }

    private function escapePdfText(string $text): string
    {
        return str_replace(
            ['\\', '(', ')'],
            ['\\\\', '\\(', '\\)'],
            $text,
        );
    }
}
