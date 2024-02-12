import van from "vanjs-core"
import * as vanX from "vanjs-ext"

import { getDb } from '../db/db.js'
import { getStore, addWarning } from '../store.js'
import cameraImage from '../images/camera.png'
import LocationImage from '../images/location.png'

const { a, button, canvas, div, h3, img, label, li, nav, p, ul, video } = van.tags

const db = getDb();
const store = getStore()
let stream = null
const hasPosition = van.state(false)
const hasPhoto = van.state(false)
const photo = van.state(null)

const videoElement = video({ class: "preview", id: "camera" }, "allow camera!")
const previewElement = canvas({ class: "preview" })

const position = van.state({
    lng: 0,
    lat: 0
})


const setup = () => {
    function success(pos) {
        const crd = pos.coords;
        position.val = { lat: crd.latitude, lng: crd.longitude }
        hasPosition.val = true;
    }

    function error(err) {
        addWarning("Didn't get position!")
        console.warn(`An error occurred during position acquiering:(${err.code}): ${err.message}`);
    }

    navigator.geolocation.getCurrentPosition(success, error, {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0,
    });


    navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: 'environment'
        },
        audio: false
    })
        .then(function (s) {
            stream = s
            videoElement.srcObject = stream;
            videoElement.play();
            hasPhoto.val = false
            photo.val = null
        })
        .catch(function (err) {
            addWarning("Didn't get camera feed!")
            console.log("An error occurred during camera operation: " + err);
        });
}
const clearImage = () => {
    setup()
}

const takePhoto = () => {
    previewElement.width = videoElement.videoWidth;
    previewElement.height = videoElement.videoHeight;
    var context = previewElement.getContext("2d");
    context.drawImage(videoElement, 0, 0, videoElement.videoWidth, videoElement.videoHeight);

    photo.val = previewElement.toDataURL('image/jpg');
    stream.getTracks().forEach((track) => {
        if (track.readyState == 'live') {
            track.stop();
            hasPhoto.val = true
        }
    });

}


export const NewItemPage = () => {

    clearImage()

    return div({ class: "content" },
        div({ class: "new-item-form" },
            div({ class: () => hasPhoto.val ? "preview-container" : "preview-container visible" },
                videoElement),
            div({ class: () => hasPhoto.val ? "preview-container visible" : "preview-container" },
                previewElement),
            () => hasPhoto.val ?
                button({ class: "trigger", onclick: () => clearImage() }, "clear") :
                button({ disabled: () => !hasPosition.val, class: "trigger", onclick: () => takePhoto() }, hasPosition.val ? img({ src: cameraImage }) : "... waiting for gps position"),
        )

    )

}
