import { useEffect, useState, useRef, useCallback } from "react";
import { Container, Row, Col, Card, Spinner, Button, ListGroup, FormControl, Table, ButtonGroup } from "react-bootstrap";
import axios from "axios";
import DynamicBackground from "../components/DynamicBackgroud";

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
            } else {
                playNext();
            }
        };

        audio.addEventListener("play", handlePlay);
        audio.addEventListener("pause", handlePause);
        audio.addEventListener("ended", handleEnded);

        return () => {
            audio.removeEventListener("play", handlePlay);
            audio.removeEventListener("pause", handlePause);
            audio.removeEventListener("ended", handleEnded);
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

    return (
        <div style={{ position: "relative", minHeight: "100vh" }}>
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
                                <Col xs={1}>
                                    <img src={currentTrack.albumArtUrl}
                                        alt="Album Art"
                                        width="50" height="50"
                                        className="album-art" />
                                </Col>
                                <Col xs={4}>
                                    <div><strong>{currentTrack.title}</strong></div>
                                    <div style={{ fontSize: "0.9em" }}>{currentTrack.artist}</div>
                                </Col>
                                <Col xs={4} className="text-center">
                                    <Button variant="secondary" onClick={(e) => { e.stopPropagation(); playPrev(); }}>⏮</Button>
                                    <Button variant={isPlaying ? "danger" : "success"}
                                        onClick={(e) => { e.stopPropagation(); togglePlayPause(); }}>
                                        {isPlaying ? "⏸" : "▶"}
                                    </Button>
                                    <Button variant="secondary" onClick={(e) => { e.stopPropagation(); playNext(); }}>⏭</Button>
                                </Col>
                                <Col xs={3} className="text-end">
                                    <Button variant={repeat ? "warning" : "outline-warning"} onClick={(e) => { e.stopPropagation(); setRepeat(!repeat); }}>
                                        🔁
                                    </Button>
                                    <Button variant={shuffle ? "info" : "outline-info"} onClick={(e) => { e.stopPropagation(); setShuffle(!shuffle); }}>
                                        🔀
                                    </Button>
                                    <FormControl type="range" min={0} max={1} step={0.01}
                                        style={{ width: "100px", display: "inline-block" }}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) => { audioRef.current.volume = e.target.value; }}
                                    />
                                </Col>
                            </Row>
                        </Card.Body>
                    </Card>
                )}
                {currentTrack && isFullPlayer && (
                    <div className="fullscreen-overlay">
                        <Container>
                            <Button variant="light" className="mb-2" onClick={() => setIsFullPlayer(false)}>⬇ Thu nhỏ</Button>
                            <Row>
                                {/* Album art bên trái */}
                                <Col md={5} className="text-center">
                                    <img src={currentTrack.albumArtUrl} alt="Album Art"
                                        style={{ maxWidth: "100%", borderRadius: "12px" }} />
                                    <h5 className="mt-3">{currentTrack.title}</h5>
                                    <p>{currentTrack.artist} — {currentTrack.album}</p>
                                    <ButtonGroup className="mt-2">
                                        <Button variant="secondary" onClick={playPrev}>⏮</Button>
                                        <Button variant={isPlaying ? "danger" : "success"}
                                            onClick={togglePlayPause}>
                                            {isPlaying ? "⏸" : "▶"}
                                        </Button>
                                        <Button variant="secondary" onClick={playNext}>⏭</Button>
                                        <Button variant={repeat ? "warning" : "outline-warning"} onClick={() => setRepeat(!repeat)}>🔁</Button>
                                        <Button variant={shuffle ? "info" : "outline-info"} onClick={() => setShuffle(!shuffle)}>🔀</Button>
                                    </ButtonGroup>
                                </Col>

                                {/* Lyric bên phải */}
                                <Col md={7}>
                                    {currentTrack?.lyrics?.[0]?.syncText?.length > 0 && (
                                        <ListGroup id="lyrics-container" variant="flush"
                                            style={{ maxHeight: "70vh", overflowY: "auto" }}>
                                            {currentTrack.lyrics[0].syncText.map((line, idx) => (
                                                <ListGroup.Item
                                                    id={`lyric-${idx}`}
                                                    key={idx}
                                                    style={{
                                                        color: idx === currentLyricIndex ? "red" : "black",
                                                        fontWeight: idx === currentLyricIndex ? "bold" : "normal"
                                                    }}
                                                >
                                                    {line.text}
                                                </ListGroup.Item>
                                            ))}
                                        </ListGroup>
                                    )}
                                </Col>
                            </Row>
                    </Container>
                    </div>
                    
                )}
            </Container>
            <audio ref={audioRef} style={{ display: "none" }} />
        </div>
        
    );
}
