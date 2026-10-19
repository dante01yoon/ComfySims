#!/bin/sh
set -e
M=docs/recordings/media
G=$M/gif
gif() {
  name=$1; shift
  filter=""; inputs=""; labels=""; i=0
  for seg in "$@"; do
    file=$(echo $seg | cut -d: -f1); from=$(echo $seg | cut -d: -f2); to=$(echo $seg | cut -d: -f3); speed=$(echo $seg | cut -d: -f4)
    inputs="$inputs -ss $from -to $to -i $M/roomfit-$file.mp4"
    filter="$filter[$i:v]setpts=PTS/$speed,fps=10,scale=720:-2:flags=lanczos,setsar=1[v$i];"
    labels="$labels[v$i]"; i=$((i+1))
  done
  ffmpeg -v error -y $inputs -filter_complex "${filter}${labels}concat=n=$i:v=1:a=0,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" -loop 0 $G/$name.gif
}
gif place place:22:38:2 place:51.5:55.5:1
gif blueprint blueprint:18:34:2.5 blueprint:57:61:1
gif agent agent:58:70:1.6 agent:84:89:1
gif 360 360:20:23:1 360:26:36:1.4
gif products products:24:40:1.8
gif local-cloud local-cloud:30:44:1.6
gif studio studio:0:8:1
