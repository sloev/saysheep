import van from "vanjs-core"
import * as vanX from "vanjs-ext"

import { getDb } from '../db/db.js'
import { getStore, addWarning } from '../store.js'
import cameraImage from '../images/camera.png'
import LocationImage from '../images/location.png'
import { cone } from '../router.js'

const { a, button, canvas, div, h3, img, input, label, li, nav, p, textarea, ul, video } = van.tags

const db = getDb();
const store = getStore()
let stream = null
const hasPosition = van.state(false)
const hasPhoto = van.state(false)
const photo = van.state(null)
const title = van.state("")
const description = van.state("")

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

const createNewItem = async () => {
    try {
        await db.createNewItem({ position: position.val, photo: photo.val, title: title.val, description: description.val })
        cone.navigate("map", {})
    } catch (e) {
        console.log("error", e)
    }
}


export const NewItemPage = (params) => {
    console.log("cone", params)

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

            div({ class: "new-item-field-container" },
                input({
                    class: "new-item-field",
                    type: "text",
                    placeholder: "title", value: title,
                    oninput: e => title.val = e.target.value
                })),
            div({ class: "new-item-field-container" },
                textarea({
                    class: "new-item-field",
                    placeholder: "description",
                    required: "True",
                    value: description, maxlength: "300",
                    oninput: e => description.val = e.target.value
                })),

            div({ class: "new-item-field-container" },
                button({
                    disabled: () => title.val.length < 1 || description.val.length < 1 ||
                        !hasPhoto.val || !hasPosition.val,
                    class: "new-item-field",
                    onclick: createNewItem
                }, "Create"))


        )
    )

}
