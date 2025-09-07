import { useEffect, useState, useRef, useCallback } from "react";
import { Container, Row, Col, Card, Spinner, Button, ListGroup, FormControl, Table } from "react-bootstrap";
import axios from "axios";
import { FaPlay, FaPause, FaStepBackward, FaStepForward, FaRedo, FaRandom, FaSortDown } from 'react-icons/fa';
import DynamicBackground from "../components/DynamicBackgroud";
import FormRange from "react-bootstrap/esm/FormRange";

export default function Home() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentTrack, setCurrentTrack] = useState(null);
    const [filterSearch, setfilterSearch] = useState('');
    const audioRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [repeat, setRepeat] = useState(false);
    const [shuffle, setShuffle] = useState(false);
    const [currentLyricIndex, setCurrentLyricIndex] = useState(0);
    const [isFullPlayer, setIsFullPlayer] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    useEffect(() => {
        axios.get("http://localhost:9999/items")
            .then((res) => {
                setItems(res.data); // Load list nhạc ngay
                setLoading(false);
            });
    }, []);
    const playTrack = useCallback((track) => {
        setCurrentTrack(track);

    }, [])

    const getCurrentIndex = useCallback(() => {
        return items.findIndex(i => i.id === currentTrack?.id)
    }, [items, currentTrack]);

    //Bài tiếp theo
    const playNext = useCallback(() => {
        if (!items.length) return;
        let nextIndex;
        if (shuffle) {
            nextIndex = Math.floor(Math.random() * items.length);
        } else {
            const currentIndex = getCurrentIndex();
            nextIndex = (currentIndex + 1) % items.length;
        }
        playTrack(items[nextIndex]);
    }, [items, shuffle, getCurrentIndex, playTrack]);

    // Quay lại bài trước
    const playPrev = useCallback(() => {
        if (!items.length) return;
        const currentIndex = getCurrentIndex();
        const prevIndex = (currentIndex - 1 + items.length) % items.length;
        playTrack(items[prevIndex]);
    }, [items, getCurrentIndex, playTrack]);

    const togglePlayPause = useCallback(() => {
        const audio = audioRef.current;
        if (!audio) return;

        if (audio.paused) {
            audio.play();
        } else {
            audio.pause();
        }
    }, []);
    useEffect(() => {
        if (currentTrack && audioRef.current) {
            const audio = audioRef.current;
            audio.src = currentTrack.url;
            audio.load();
            audio.onloadedmetadata = () => {
                audio.play().catch(console.error);
            };
            setCurrentLyricIndex(0);
            setCurrentTime(0);
            const container = document.getElementById("lyrics-container");
            if (container) container.scrollTop = 0;
        }
    }, [currentTrack]);
    // Lắng nghe sự kiện audio
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const handlePlay = () => setIsPlaying(true);
        const handlePause = () => setIsPlaying(false);
        const handleEnded = () => {
            if (repeat) {
                audio.currentTime = 0;
                audio.play();
                // 🔹 Reset lyric khi replay
                setCurrentLyricIndex(0);
                const container = document.getElementById("lyrics-container");
                if (container) container.scrollTop = 0;
            } else {
                playNext();
            }
        };

        const updateTime = () => setCurrentTime(audio.currentTime);
        const setAudioData = () => setDuration(audio.duration);

        audio.addEventListener("play", handlePlay);
        audio.addEventListener("pause", handlePause);
        audio.addEventListener("ended", handleEnded);
        audio.addEventListener("timeupdate", updateTime);
        audio.addEventListener("loadedmetadata", setAudioData);
        return () => {
            audio.removeEventListener("play", handlePlay);
            audio.removeEventListener("pause", handlePause);
            audio.removeEventListener("ended", handleEnded);
            audio.removeEventListener("timeupdate", updateTime);
            audio.removeEventListener("loadedmetadata", setAudioData);
        };
    }, [repeat, shuffle, items, currentTrack, playNext]);
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || !currentTrack?.lyrics?.[0]?.syncText) return;

        const checkLyric = () => {
            const timeMs = audio.currentTime * 1000; // audio.currentTime là giây, dữ liệu timestamp là ms
            const idx = currentTrack.lyrics[0].syncText.findIndex(
                (line, i) =>
                    timeMs >= line.timestamp &&
                    timeMs < (currentTrack.lyrics[0].syncText[i + 1]?.timestamp || Infinity)
            );
            if (idx !== -1 && idx !== currentLyricIndex) setCurrentLyricIndex(idx);
        };

        audio.addEventListener("timeupdate", checkLyric);
        const container = document.getElementById("lyrics-container");
        const element = document.getElementById(`lyric-${currentLyricIndex}`);
        if (container && element) {
            container.scrollTop = element.offsetTop - container.offsetTop - container.clientHeight / 2 + element.clientHeight / 2;
        }
        return () => audio.removeEventListener("timeupdate", checkLyric);
    }, [currentTrack, currentLyricIndex]);

    if (loading) {
        return (
            <Container className="text-center mt-5">
                <Spinner animation="border" />
                <p>Đang tải dữ liệu nhạc...</p>
            </Container>
        );
    }

    // useEffect(() => {
    //     if (localData?.items) {
    //         setItems(localData.items);
    //     }
    //     setLoading(false);
    // }, []);

    //Loại bỏ dấu ở phiu tơ
    const removeVietnameseTones = (str) => {
        return String(str)
            .normalize("NFD") // tách dấu
            .replace(/[\u0300-\u036f]/g, "") // xóa dấu
            .replace(/đ/g, "d").replace(/Đ/g, "D")
            .toLowerCase(); // về lowercase cho dễ so sánh
    };

    //phiu tơ này
    const filterMusic = items.filter(i => {
        const keywords = (removeVietnameseTones(filterSearch) || "").split(" ").filter(Boolean);
        const text = removeVietnameseTones(`${i.title ?? ""} ${i.artist ?? ""} ${i.genre}`);
        return keywords.every(keyword => text.includes(keyword));
    })

    const handleSearchChange = (e) => {
        setfilterSearch(e.target.value)
    }
    // Hàm format mm:ss
    const formatTime = (seconds) => {
        if (!seconds) return "0:00";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60).toString().padStart(2, "0");
        return `${m}:${s}`;
    };
    return (
        <div style={{ position: "relative", minHeight: "100vh" }} >
            <DynamicBackground track={currentTrack} />

            <Container className="mt-3">
                <Row className="mb-3">
                    <Col md={3}>
                        <FormControl onChange={handleSearchChange} value={filterSearch} type="text" placeholder="Enter search title" />
                    </Col>
                </Row>
                <Row>
                    <Table hover border={1} className="table-glass text-white">
                        <thead>
                            <tr>
                                <th style={{ width: "80px" }}>#</th>
                                <th>Title</th>
                                <th>Artist</th>
                                <th>Album</th>
                                <th>Duration</th>
                                <th>Genre</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filterMusic.map((i) => (
                                <tr md={4} key={i.id} onClick={() => playTrack(i)} style={{ cursor: 'pointer' }} >
                                    <td>
                                        <img src={i.albumArtUrl} loading="lazy" width="50px" height="50px" className="album-art" alt={`${i.title} album art`} />
                                    </td>
                                    <td>{i.title}</td>
                                    <td>{i.artist}<br /></td>
                                    <td>{i.album}<br /></td>
                                    <td>{i.duration}<br /></td>
                                    <td>{i.genre}<br /></td>
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                </Row>

                {/* Music Player */}
                {currentTrack && !isFullPlayer && (
                    <Card
                        className="mt-4 sticky-bottom shadow-lg"
                        style={{ cursor: "pointer" }}
                        onClick={() => setIsFullPlayer(true)}
                    >
                        <Card.Body>
                            <Row className="align-items-center">

                                <Col xs="auto">
                                    <img src={currentTrack.albumArtUrl}
                                        alt="Album Art"
                                        width="50" height="50"
                                        className="album-art" />
                                </Col>

                                <Col className="text-truncate">
                                    <div className="fw-bold text-truncate">{currentTrack.title}</div>
                                    <div className="small text-muted text-truncate">{currentTrack.artist}</div>
                                </Col>

                                <Col xs="auto" className="text-center">
                                    <Button variant="secondary" className="mx-1" onClick={(e) => { e.stopPropagation(); playPrev(); }}><FaStepBackward /></Button>
                                    <Button variant={isPlaying ? "danger" : "success"} className="mx-1"
                                        onClick={(e) => { e.stopPropagation(); togglePlayPause(); }}>
                                        {isPlaying ? <FaPause /> : <FaPlay />}
                                    </Button>
                                    <Button variant="secondary" className="mx-1" onClick={(e) => { e.stopPropagation(); playNext(); }}><FaStepForward /></Button>
                                </Col>

                                <Col xs="auto" className="ms-auto">
                                    <div className="d-flex align-items-center gap-2">
                                        <Button variant={repeat ? "warning" : "outline-warning"} onClick={(e) => { e.stopPropagation(); setRepeat(!repeat); }}>
                                            <FaRedo />
                                        </Button>
                                        <Button variant={shuffle ? "info" : "outline-info"} onClick={(e) => { e.stopPropagation(); setShuffle(!shuffle); }}>
                                            <FaRandom />
                                        </Button>
                                        <FormRange
                                            min={0} max={1} step={0.01}
                                            style={{ width: "100px", display: "inline-block", verticalAlign: "middle" }}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => { audioRef.current.volume = e.target.value; }}
                                        />
                                    </div>
                                </Col>
                            </Row>
                            <Row className="align-items-center mt-2">
                                <Col xs="auto" className="small text-muted">
                                    {formatTime(currentTime)}
                                </Col>
                                <Col>
                                    <FormRange
                                        min={0}
                                        max={duration || 0}
                                        step={0.1}
                                        value={currentTime}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) => {
                                            audioRef.current.currentTime = e.target.value;
                                            setCurrentTime(e.target.value);
                                        }}
                                    />
                                </Col>
                                <Col xs="auto" className="small text-muted">
                                    {formatTime(duration)}
                                </Col>
                            </Row>
                        </Card.Body>
                    </Card>
                )}
                {currentTrack && isFullPlayer && (
                    <div className="fullscreen-overlay">
                        <Container >
                            <Row className="d-flex justify-content-center mb-3">
                                <Button variant="link" style={{ color: "white" }} onClick={() => setIsFullPlayer(false)}><FaSortDown size={100} /></Button>
                            </Row>
                            <Row className="mb-3">
                                {/* Album art bên trái */}
                                <Col md={5} className="text-center">
                                    <img src={currentTrack.albumArtUrl} alt="Album Art"
                                        style={{ maxWidth: "90%", borderRadius: "20px", boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }} />

                                    <h4 className="mt-4 fw-bold">{currentTrack.title}</h4>
                                    <p>{currentTrack.artist} — {currentTrack.album}</p>

                                    <div className="d-flex justify-content-center align-items-center gap-4 mb-2">
                                        <Button
                                            variant="link"
                                            onClick={() => setShuffle(!shuffle)}
                                            style={{ color: shuffle ? "#1DB954" : "white" }}
                                        >
                                            <FaRandom size={20} />
                                        </Button>
                                        <Button variant="link" onClick={playPrev} style={{ color: "white" }}>
                                            <FaStepBackward size={24} />
                                        </Button>
                                        <Button
                                            variant="light"
                                            onClick={togglePlayPause}
                                            style={{ borderRadius: "50%", width: "60px", height: "60px" }}
                                        >
                                            {isPlaying ? <FaPause size={28} /> : <FaPlay size={28} />}
                                        </Button>
                                        <Button variant="link" onClick={playNext} style={{ color: "white" }}>
                                            <FaStepForward size={24} />
                                        </Button>
                                        <Button
                                            variant="link"
                                            onClick={() => setRepeat(!repeat)}
                                            style={{ color: repeat ? "#1DB954" : "white" }}
                                        >
                                            <FaRedo size={20} />
                                        </Button>
                                    </div>
                                </Col>

                                {/* Lyric bên phải */}
                                <Col md={7}>
                                    {currentTrack?.lyrics?.[0]?.syncText?.length > 0 ? (
                                        <ListGroup
                                            id="lyrics-container"
                                            variant="flush"
                                            style={{
                                                maxHeight: "70vh",
                                                overflowY: "auto",
                                                scrollbarWidth: "none"
                                            }}>
                                            {currentTrack.lyrics[0].syncText.map((line, idx) => (
                                                <ListGroup.Item
                                                    id={`lyric-${idx}`}
                                                    key={idx}
                                                    style={{
                                                        background: "transparent",
                                                        border: "none",
                                                        textAlign: "center",
                                                        fontSize: idx === currentLyricIndex ? "1.3em" : "1em",
                                                        color: idx === currentLyricIndex ? "#ff4081" : "#ccc",
                                                        fontWeight: idx === currentLyricIndex ? "bold" : "normal",
                                                        transition: "all 0.3s ease"
                                                    }}
                                                >
                                                    {line.text}
                                                </ListGroup.Item>
                                            ))}
                                        </ListGroup>
                                    ) : (
                                        <div
                                            id="lyrics-container"
                                            variant="flush"
                                            className="d-flex flex-column justify-content-center align-items-center"
                                            style={{
                                                height: "70vh",
                                                textAlign: "center",
                                                color: "#999",
                                                fontStyle: "italic"
                                            }}>
                                            Không có lời bài hát
                                        </div>
                                    )}
                                </Col>
                            </Row>
                            <div className="d-flex align-items-center gap-2 w-100 mb-3" >
                                {/* Thời gian hiện tại */}
                                <small style={{ width: "40px", textAlign: "right", color: "white" }}>
                                    {formatTime(currentTime)}
                                </small>
                                {/* Thanh progress */}
                                <input type="range"
                                    min={0}
                                    max={duration || 0}
                                    step={0.1}
                                    value={currentTime}
                                    onChange={(e) => {
                                        audioRef.current.currentTime = e.target.value;
                                        setCurrentTime(e.target.value);
                                    }}
                                    style={{
                                        "--progress": `${(currentTime / (duration || 1)) * 100}%`
                                    }}
                                    className="progress-bar-custom flex-grow-1"
                                />
                                {/* Thời lượng tổng */}
                                <small style={{ width: "40px", color: "white" }}>{formatTime(duration)}</small>
                            </div>
                        </Container>
                    </div>
                )}
            </Container>
            <audio ref={audioRef} style={{ display: "none" }} />
        </div>

    );
}
