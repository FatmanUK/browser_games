#!/usr/bin/env python3
"""Generates games/racer/track-data.js: a large, randomly shaped
closed race track (centerline + derived road/verge/bound radius
lookup tables, hazards, treeline and a starting grid), in the
same star-shaped-from-center style as the oval it replaces so
the game's existing angle-based physics keep working unchanged.

Re-run this any time a fresh track is wanted:

	tools/generate_track.py [--seed N]

With no --seed, a random seed is chosen and printed so a
specific track can be reproduced later.
"""
import argparse
import bisect
import math
import random
import sys

ANGLE_STEPS = 720
CONTROL_POINTS = 16
BASE_RADIUS = 550
RADIUS_JITTER = 120
ANGLE_JITTER_FRAC = 0.35
SAMPLES_PER_SEGMENT = 40
MAX_ATTEMPTS = 50

ROAD_WIDTH = 100
VERGE_WIDTH = 40

CAR_LENGTH = 16
CAR_WIDTH = 9
GRID_ROWS = 6
GRID_ROW_GAP = CAR_LENGTH * 1.8
GRID_LANE_OFFSET = ROAD_WIDTH * 0.22
LINE_SETBACK = CAR_LENGTH * 1.2

SAND_WEDGE_COUNT = 3
SAND_WEDGE_SPREAD = math.radians(14)
CORNER_TURN_THRESHOLD = math.radians(1.1)
CORNER_MIN_RUN = 10
HAZARD_MIN_FRAC = 0.22
HAZARD_MAX_FRAC = 0.78
HAZARD_CLEAR_ANGLE = math.radians(20)

# Hard obstacles and water live off the track surface — oil is
# the only hazard on the track itself. Scattering them one-per-
# sector around a ring (rather than clustering at random) means
# a straight-line shortcut across the infield risks running into
# something from any direction. Tyres and barrels are small (car-
# sized or smaller) and can land either in the grassy infield or
# out past the rumble strips in the verge; trees and buildings
# are the big obstacles and stay infield-only, filling out the
# middle of a track now large enough to otherwise feel empty.
# Tyres bounce the car off; everything else is solid and stops
# it dead.
OBSTACLE_SPECS = [
	{
		'type': 'tyre', 'r': 3, 'behavior': 'bounce',
		'zones': ('infield', 'verge'),
	},
	{
		'type': 'tyre', 'r': 3.5, 'behavior': 'bounce',
		'zones': ('infield', 'verge'),
	},
	{
		'type': 'tyre', 'r': 3, 'behavior': 'bounce',
		'zones': ('infield', 'verge'),
	},
	{
		'type': 'barrel', 'r': 3.5, 'behavior': 'stop',
		'zones': ('infield', 'verge'),
	},
	{
		'type': 'barrel', 'r': 4, 'behavior': 'stop',
		'zones': ('infield', 'verge'),
	},
	{
		'type': 'barrel', 'r': 3.5, 'behavior': 'stop',
		'zones': ('infield', 'verge'),
	},
	{
		'type': 'tree', 'r': 14, 'behavior': 'stop',
		'zones': ('infield',),
	},
	{
		'type': 'tree', 'r': 15, 'behavior': 'stop',
		'zones': ('infield',),
	},
	{
		'type': 'building', 'r': 18, 'behavior': 'stop',
		'zones': ('infield',),
	},
	{
		'type': 'building', 'r': 22, 'behavior': 'stop',
		'zones': ('infield',),
	},
	{
		'type': 'building', 'r': 20, 'behavior': 'stop',
		'zones': ('infield',),
	},
	{
		'type': 'building', 'r': 16, 'behavior': 'stop',
		'zones': ('infield',),
	},
]
WATER_RADII = [18, 16]

# Tree count per layer is derived from the track's own perimeter
# (below) rather than a fixed number, so the treeline's density
# stays the same regardless of how large a given track comes out
# — a fixed tree count went visibly thin once tracks got much
# bigger. `spacing` is the target gap (world units) between tree
# centers along that layer's ring; smaller = denser.
TREE_LAYERS = [
	{'spacing': 40, 'offset': 0, 'r': 9},
	{'spacing': 32, 'offset': 15, 'r': 11},
	{'spacing': 38, 'offset': 30, 'r': 10},
	{'spacing': 48, 'offset': 45, 'r': 12},
	{'spacing': 55, 'offset': 62, 'r': 13},
]


def wrap_delta(a, b):
	d = b - a
	while d > math.pi:
		d -= 2 * math.pi
	while d < -math.pi:
		d += 2 * math.pi
	return d


def catmull_rom_point(p0, p1, p2, p3, t):
	t2 = t * t
	t3 = t2 * t

	def axis(a0, a1, a2, a3):
		return 0.5 * (
			(2 * a1)
			+ (-a0 + a2) * t
			+ (2 * a0 - 5 * a1 + 4 * a2 - a3) * t2
			+ (-a0 + 3 * a1 - 3 * a2 + a3) * t3)

	return (
		axis(p0[0], p1[0], p2[0], p3[0]),
		axis(p0[1], p1[1], p2[1], p3[1]))


def catmull_rom_closed(points, samples_per_segment):
	n = len(points)
	result = []
	for i in range(n):
		p0 = points[(i - 1) % n]
		p1 = points[i % n]
		p2 = points[(i + 1) % n]
		p3 = points[(i + 2) % n]
		for s in range(samples_per_segment):
			t = s / samples_per_segment
			result.append(
				catmull_rom_point(p0, p1, p2, p3, t))
	return result


def control_points(rng):
	base_step = (2 * math.pi) / CONTROL_POINTS
	polar = []
	for i in range(CONTROL_POINTS):
		angle = i * base_step
		angle += rng.uniform(-1, 1) * base_step * \
			ANGLE_JITTER_FRAC
		radius = BASE_RADIUS + rng.uniform(-1, 1) * \
			RADIUS_JITTER
		polar.append((angle % (2 * math.pi), radius))
	polar.sort(key=lambda p: p[0])
	return [
		(r * math.cos(a), r * math.sin(a)) for a, r in polar]


def is_star_shaped(dense):
	prev = math.atan2(dense[0][1], dense[0][0])
	for x, y in dense[1:]:
		a = math.atan2(y, x)
		if wrap_delta(prev, a) < -1e-3:
			return False
		prev = a
	return True


def generate_centerline(seed):
	rng = random.Random(seed)
	for attempt in range(MAX_ATTEMPTS):
		pts = control_points(rng)
		dense = catmull_rom_closed(pts, SAMPLES_PER_SEGMENT)
		if is_star_shaped(dense):
			return dense
	raise RuntimeError(
		'could not generate a star-shaped track; try another '
		'--seed')


def unwrapped_angles(dense):
	first = math.atan2(dense[0][1], dense[0][0])
	out = [first]
	prev_raw = first
	for x, y in dense[1:]:
		a = math.atan2(y, x)
		out.append(out[-1] + wrap_delta(prev_raw, a))
		prev_raw = a
	return out


def build_radius_lookup(dense):
	unwrapped = unwrapped_angles(dense)
	radii = [math.hypot(x, y) for x, y in dense]
	# Extend by a full turn on each side so interpolation across
	# the 0/2pi seam never has to special-case the array ends.
	span = []
	for shift in (-2 * math.pi, 0, 2 * math.pi):
		span.extend(a + shift for a in unwrapped)
	span_radii = radii * 3

	table = []
	for k in range(ANGLE_STEPS):
		target = k * 2 * math.pi / ANGLE_STEPS
		i = bisect.bisect_left(span, target, 1, len(span) - 1)
		a0, a1 = span[i - 1], span[i]
		r0, r1 = span_radii[i - 1], span_radii[i]
		frac = 0 if a1 == a0 else (target - a0) / (a1 - a0)
		table.append(r0 + (r1 - r0) * frac)
	return table


def lerp_table(table, angle):
	n = len(table)
	t = ((angle % (2 * math.pi)) / (2 * math.pi)) * n
	i0 = int(math.floor(t)) % n
	i1 = (i0 + 1) % n
	frac = t - math.floor(t)
	return table[i0] * (1 - frac) + table[i1] * frac


def heading_run_lengths(dense):
	n = len(dense)
	headings = []
	for i in range(n):
		x0, y0 = dense[i]
		x1, y1 = dense[(i + 1) % n]
		headings.append(math.atan2(y1 - y0, x1 - x0))
	return headings


def turn_rates(headings):
	n = len(headings)
	return [
		abs(wrap_delta(headings[i - 1], headings[i]))
		for i in range(n)
	]


# Contiguous stretches that bend hard enough to count as a
# corner, exported so the game can put its oil where losing
# steering actually costs the player something.
def corner_runs(turn):
	n = len(turn)
	runs = []
	i = 0
	while i < n:
		if turn[i] < CORNER_TURN_THRESHOLD:
			i += 1
			continue
		start = i
		while i < n and turn[i] >= CORNER_TURN_THRESHOLD:
			i += 1
		if i - start >= CORNER_MIN_RUN:
			runs.append((start, i - 1))
	return runs


def build_corners(dense, headings):
	corners = []
	for start, end in corner_runs(turn_rates(headings)):
		a0 = math.atan2(dense[start][1], dense[start][0])
		a1 = math.atan2(dense[end][1], dense[end][0])
		span = wrap_delta(a0, a1)
		if span <= 0:
			continue
		center = (a0 + span / 2) % (2 * math.pi)
		corners.append({
			'angle': round(center, 4),
			'spread': round(span / 2, 4),
		})
	return corners


def find_longest_straight(dense, turn_threshold=math.radians(2.2)):
	headings = heading_run_lengths(dense)
	n = len(headings)
	turn = turn_rates(headings)
	best_start, best_len = 0, 0
	i = 0
	while i < n:
		if turn[i] > turn_threshold:
			i += 1
			continue
		start = i
		while i < n and turn[i] <= turn_threshold:
			i += 1
		length = i - start
		if length > best_len:
			best_start, best_len = start, length
	return best_start, best_len, headings


def build_start_and_grid(dense, headings, straight_start,
		straight_len):
	# Put the line a little before the straight's end (so there's
	# clear track ahead of it too), and lay the grid out behind
	# that, back along the straight, in the direction of travel.
	line_idx = straight_start + max(
		1, int(straight_len * 0.7))
	line_idx %= len(dense)
	line_point = dense[line_idx]
	direction = headings[line_idx]
	dx, dy = math.cos(direction), math.sin(direction)
	px, py = -dy, dx

	line_x = line_point[0] - dx * LINE_SETBACK
	line_y = line_point[1] - dy * LINE_SETBACK
	start = {
		'x': round(line_x, 2), 'y': round(line_y, 2),
		'angle': round(direction, 4),
	}

	slots = []
	for row in range(GRID_ROWS):
		back = (row + 1) * GRID_ROW_GAP
		side = GRID_LANE_OFFSET if row % 2 == 0 \
			else -GRID_LANE_OFFSET
		slots.append({
			'x': round(line_x - dx * back + px * side, 2),
			'y': round(line_y - dy * back + py * side, 2),
			'angle': round(direction, 4),
		})
	return start, slots, line_idx


def infield_point(inner_table, angle, frac):
	r = lerp_table(inner_table, angle) * frac
	return (math.cos(angle) * r, math.sin(angle) * r)


def verge_point(outer_table, bound_table, angle, frac):
	outer_r = lerp_table(outer_table, angle)
	bound_r = lerp_table(bound_table, angle)
	r = outer_r + (bound_r - outer_r) * frac
	return (math.cos(angle) * r, math.sin(angle) * r)


def zone_point_fn(zone, tables):
	inner_table, outer_table, bound_table = tables
	if zone == 'infield':
		return lambda a, f: infield_point(inner_table, a, f)
	return lambda a, f: verge_point(
		outer_table, bound_table, a, f)


def far_from(x, y, placed, min_gap):
	return all(
		math.hypot(x - px, y - py) >= min_gap
		for px, py in placed)


def near_grid_zone(angle, grid_angle):
	return abs(wrap_delta(grid_angle, angle)) < \
		HAZARD_CLEAR_ANGLE


def sector_angle(rng, sector_index, sector_count, grid_angle):
	width = 2 * math.pi / sector_count
	base = sector_index * width
	for _ in range(50):
		angle = base + rng.uniform(0, width)
		if not near_grid_zone(angle, grid_angle):
			return angle
	for _ in range(200):
		angle = rng.uniform(0, 2 * math.pi)
		if not near_grid_zone(angle, grid_angle):
			return angle
	raise RuntimeError('could not find a clear hazard angle')


def place_in_sector(
		point_fn, rng, sector_index, sector_count,
		grid_angle, placed, min_gap):
	for _ in range(100):
		angle = sector_angle(
			rng, sector_index, sector_count, grid_angle)
		frac = rng.uniform(HAZARD_MIN_FRAC, HAZARD_MAX_FRAC)
		x, y = point_fn(angle, frac)
		if far_from(x, y, placed, min_gap):
			return x, y
	raise RuntimeError('could not place a hazard')


def build_obstacles_and_water(tables, rng, grid_angle):
	slots = len(OBSTACLE_SPECS) + len(WATER_RADII)
	order = list(range(slots))
	rng.shuffle(order)

	placed = []
	obstacles = []
	for spec, sector in zip(OBSTACLE_SPECS, order):
		zone = rng.choice(spec['zones'])
		point_fn = zone_point_fn(zone, tables)
		x, y = place_in_sector(
			point_fn, rng, sector, slots, grid_angle,
			placed, spec['r'] * 3 + 6)
		placed.append((x, y))
		obstacles.append({
			'x': round(x, 1), 'y': round(y, 1),
			'r': spec['r'], 'type': spec['type'],
			'behavior': spec['behavior'],
		})

	water = []
	point_fn = zone_point_fn('infield', tables)
	for radius, sector in zip(
			WATER_RADII, order[len(OBSTACLE_SPECS):]):
		x, y = place_in_sector(
			point_fn, rng, sector, slots, grid_angle,
			placed, radius * 3 + 6)
		placed.append((x, y))
		water.append({
			'x': round(x, 1),
			'y': round(y, 1),
			'r': radius,
		})

	return obstacles, water


def build_sand_wedges(rng, grid_angle):
	wedges = []
	for _ in range(200):
		if len(wedges) >= SAND_WEDGE_COUNT:
			break
		angle = rng.uniform(0, 2 * math.pi)
		if near_grid_zone(angle, grid_angle):
			continue
		if any(
				abs(wrap_delta(w['angle'], angle)) <
				SAND_WEDGE_SPREAD * 2.2
				for w in wedges):
			continue
		wedges.append({
			'angle': round(angle, 4),
			'spread': round(SAND_WEDGE_SPREAD, 4),
		})
	return wedges


def build_tree_line(bound_table):
	avg_bound = sum(bound_table) / len(bound_table)
	trees = []
	for layer in TREE_LAYERS:
		radius = avg_bound + layer['offset']
		perimeter = 2 * math.pi * radius
		count = max(12, round(perimeter / layer['spacing']))
		for i in range(count):
			angle = (i / count) * 2 * math.pi
			r = lerp_table(bound_table, angle) + \
				layer['offset']
			trees.append({
				'x': round(math.cos(angle) * r, 1),
				'y': round(math.sin(angle) * r, 1),
				'r': layer['r'] + ((i % 3) - 1) * 1.5,
			})
	return trees


def derive_tables(center_table):
	outer = [r + ROAD_WIDTH / 2 for r in center_table]
	inner = [r - ROAD_WIDTH / 2 for r in center_table]
	bound = [r + VERGE_WIDTH for r in outer]
	return outer, inner, bound


def js_number_array(values, per_line=7):
	rows = []
	for i in range(0, len(values), per_line):
		chunk = values[i:i + per_line]
		rows.append(
			'\t' + ', '.join(f'{v:.2f}' for v in chunk) +
			',')
	return '\n'.join(rows)


def js_field(key, value):
	if isinstance(value, str):
		return f"{key}: '{value}'"
	return f'{key}: {value}'


# A tab is 8 columns and the 70-column limit leaves 62 for an
# object's own text; wrap one field per line once a single-line
# object would run past that.
def js_object_array(objs, fields):
	lines = []
	for obj in objs:
		parts = [js_field(key, obj[key]) for key in fields]
		oneline = '{ ' + ', '.join(parts) + ' },'
		if len(oneline) <= 62:
			lines.append('\t' + oneline)
		else:
			lines.append('\t{')
			lines += [f'\t\t{p},' for p in parts]
			lines.append('\t},')
	return '\n'.join(lines)


def render_header(seed):
	return (
		'// Generated by tools/generate_track.py '
		f'--seed {seed}\n'
		'// Do not hand-edit — rerun the script to '
		'reproduce\n'
		'// or regenerate this track.\n\n'
		f'export const TRACK_ID = {seed}\n'
		f'export const ANGLE_STEPS = {ANGLE_STEPS}\n'
		f'export const ROAD_WIDTH = {ROAD_WIDTH}\n'
		f'export const VERGE_WIDTH = {VERGE_WIDTH}\n\n')


def render_tables(outer, inner, bound):
	return (
		'export const OUTER_RADIUS = [\n' +
		js_number_array(outer) + '\n]\n\n' +
		'export const INNER_RADIUS = [\n' +
		js_number_array(inner) + '\n]\n\n' +
		'export const BOUND_RADIUS = [\n' +
		js_number_array(bound) +
		'\n]\n\n')


def render_hazards(obstacles, water, wedges, trees):
	obstacle_fields = ['x', 'y', 'r', 'type', 'behavior']
	return (
		'export const HARD_OBSTACLES = [\n' +
		js_object_array(obstacles, obstacle_fields) +
		'\n]\n\n' +
		'export const WATER_HAZARDS = [\n' +
		js_object_array(water, ['x', 'y', 'r']) +
		'\n]\n\n' +
		'export const SAND_WEDGES = [\n' +
		js_object_array(wedges, ['angle', 'spread']) +
		'\n]\n\n' +
		'export const TREE_LINE = [\n' +
		js_object_array(trees, ['x', 'y', 'r']) +
		'\n]\n\n')


def render_corners(corners):
	return (
		'export const CORNERS = [\n' +
		js_object_array(corners, ['angle', 'spread']) +
		'\n]\n\n')


def render_start(start, slots):
	return (
		'export const START = {\n'
		f"\tx: {start['x']:.2f}, y: {start['y']:.2f}, "
		f"angle: {start['angle']:.4f},\n"
		'}\n\n'
		'export const GRID_SLOTS = [\n' +
		js_object_array(slots, ['x', 'y', 'angle']) +
		'\n]\n')


def render(
		seed, outer, inner, bound, obstacles, water,
		wedges, trees, corners, start, slots):
	return (
		render_header(seed) +
		render_tables(outer, inner, bound) +
		render_hazards(obstacles, water, wedges, trees) +
		render_corners(corners) +
		render_start(start, slots))


def generate(seed):
	dense = generate_centerline(seed)
	center_table = build_radius_lookup(dense)
	outer, inner, bound = derive_tables(center_table)

	straight_start, straight_len, headings = \
		find_longest_straight(dense)
	if straight_len < 6:
		raise RuntimeError(
			'no long enough straight found; try another '
			'--seed')
	start, slots, line_idx = build_start_and_grid(
		dense, headings, straight_start, straight_len)
	grid_angle = math.atan2(
		dense[line_idx][1], dense[line_idx][0])

	rng = random.Random(seed ^ 0x5be5)
	tables = (inner, outer, bound)
	obstacles, water = build_obstacles_and_water(
		tables, rng, grid_angle)
	wedges = build_sand_wedges(rng, grid_angle)
	trees = build_tree_line(bound)
	corners = build_corners(dense, headings)
	if not corners:
		raise RuntimeError(
			'no corners found; try another --seed')

	return render(
		seed, outer, inner, bound, obstacles, water, wedges,
		trees, corners, start, slots)


def main():
	parser = argparse.ArgumentParser(description=__doc__)
	parser.add_argument(
		'--seed', type=int, default=None,
		help='reproduce a specific track')
	parser.add_argument(
		'--out', default='games/racer/track-data.js',
		help='output path (default: track-data.js)')
	args = parser.parse_args()

	seed = args.seed
	if seed is None:
		seed = random.randrange(1 << 30)

	try:
		js = generate(seed)
	except RuntimeError as exc:
		print(f'error: {exc}', file=sys.stderr)
		sys.exit(1)

	with open(args.out, 'w') as f:
		f.write(js)
	print(f'wrote {args.out} (seed={seed})')


if __name__ == '__main__':
	main()
